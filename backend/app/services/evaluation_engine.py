import asyncio
import json
import time
from decimal import Decimal
from pydantic import ValidationError
from ..db import now, dump, uid
from .scorer import calculate
from .validator import validate_draft


def checklist_from_row(row):
    return {
        **json.loads(row["config"]),
        **{k: row[k] for k in ("id", "version", "parent_id", "created_at")},
    }


def conversation_snapshot(database, cid):
    row = database.one(
        "SELECT id,group_id,external_id,language,channel,audio_url,imported_at FROM conversations WHERE id=?",
        (cid,),
    )
    if row:
        row["messages"] = database.all(
            "SELECT id,ordinal,timestamp,speaker,text FROM messages WHERE conversation_id=? ORDER BY ordinal",
            (cid,),
        )
    return row


def public_run(row):
    if not row:
        return None
    result = {
        key: value
        for key, value in row.items()
        if key not in ("snapshot", "raw_response")
    }
    for key in ("original", "final", "usage", "warnings"):
        if isinstance(result.get(key), str):
            result[key] = json.loads(result[key])
    return result


class EvaluationEngine:
    def __init__(self, database, settings, provider):
        self.db, self.settings, self.provider = database, settings, provider
        self.tasks = []

    def enqueue(self, db, cid, version, batch_id=None):
        conversation = conversation_snapshot(self.db, cid)
        if conversation is None:
            raise ValueError("Conversation not found")
        run_id = uid("run")
        db.execute(
            "INSERT INTO evaluation_runs(id,conversation_id,checklist_version_id,status,provider,model,created_at,snapshot,batch_id) VALUES(?,?,?,?,?,?,?,?,?)",
            (
                run_id,
                cid,
                version,
                "queued",
                self.provider.name,
                self.provider.model,
                now(),
                dump(conversation),
                batch_id,
            ),
        )
        return run_id

    async def start(self):
        self.tasks = [
            asyncio.create_task(self.worker()) for _ in range(self.settings.parallel)
        ]

    async def stop(self):
        for task in self.tasks:
            task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)
        if hasattr(self.provider, "close"):
            await self.provider.close()

    async def worker(self):
        while True:
            with self.db.connect(write=True) as db:
                row = db.execute(
                    "SELECT * FROM evaluation_runs WHERE status='queued' ORDER BY created_at LIMIT 1"
                ).fetchone()
                if row:
                    row = dict(row)
                    db.execute(
                        "UPDATE evaluation_runs SET status='processing',started_at=?,error=NULL WHERE id=?",
                        (now(), row["id"]),
                    )
            if not row:
                await asyncio.sleep(0.25)
                continue
            try:
                await self.process(row)
            except asyncio.CancelledError:
                raise
            except Exception:
                # Never log response bodies, PII, signed URLs or provider exception strings.
                with self.db.connect(write=True) as db:
                    db.execute(
                        "UPDATE evaluation_runs SET status='failed',error=?,finished_at=? WHERE id=?",
                        (
                            "Unexpected evaluation error. Retry or inspect the local setup.",
                            now(),
                            row["id"],
                        ),
                    )

    async def process(self, row):
        conversation = json.loads(row["snapshot"])
        checklist = checklist_from_row(
            self.db.one(
                "SELECT * FROM checklist_versions WHERE id=?",
                (row["checklist_version_id"],),
            )
        )
        started = time.monotonic()
        feedback = ""
        usage = {
            "input_tokens": 0,
            "output_tokens": 0,
            "thinking_tokens": 0,
            "total_tokens": 0,
            "attempts": 0,
            "estimated_cost_usd": None,
            "cost_is_estimate": True,
            "usage_complete": True,
        }
        error = None
        for attempt in range(3):
            usage["attempts"] += 1
            try:
                response = await asyncio.wait_for(
                    self.provider.evaluate(conversation, checklist, feedback),
                    self.settings.timeout,
                )
                for k in (
                    "input_tokens",
                    "output_tokens",
                    "thinking_tokens",
                    "total_tokens",
                ):
                    usage[k] += getattr(response, k)
                with self.db.connect(write=True) as db:
                    db.execute(
                        "UPDATE evaluation_runs SET raw_response=?,attempt_count=attempt_count+1 WHERE id=?",
                        (response.text, row["id"]),
                    )
                parsed = json.loads(response.text)
                draft = validate_draft(parsed, conversation, checklist)
                summary = calculate(
                    checklist["criteria"], [j.model_dump() for j in draft.criteria]
                )
                self.finish_usage(usage, started)
                with self.db.connect(write=True) as db:
                    db.execute(
                        "UPDATE evaluation_runs SET status='completed',original=?,final=?,usage=?,warnings=?,finished_at=?,retry_count=? WHERE id=?",
                        (
                            dump(summary),
                            dump(summary),
                            dump(usage),
                            dump(draft.provider_warnings),
                            now(),
                            attempt,
                            row["id"],
                        ),
                    )
                    for judgment in draft.criteria:
                        db.execute(
                            "INSERT INTO criterion_evaluations VALUES(?,?,?)",
                            (
                                row["id"],
                                judgment.criterion_id,
                                dump(judgment.model_dump()),
                            ),
                        )
                return
            except (ValidationError, ValueError, json.JSONDecodeError) as exc:
                # Pydantic's default repr includes input data; never use that repr here.
                if isinstance(exc, ValidationError):
                    feedback = "; ".join(
                        f"{e['loc']}: {e['msg']}"
                        for e in exc.errors(include_input=False, include_url=False)
                    )
                elif isinstance(exc, json.JSONDecodeError):
                    feedback = "Return valid JSON that matches the response schema."
                else:
                    feedback = str(exc)
                error = "Structured output invalid after bounded retries; human review/retry required."
            except Exception as exc:
                code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
                usage["usage_complete"] = False
                error = "Provider request failed or timed out. Verify key, model, quota and connectivity."
                if code and code not in (408, 429, 500, 502, 503, 504):
                    break
            if attempt < 2:
                await asyncio.sleep(min(2**attempt, 4))
        self.finish_usage(usage, started)
        with self.db.connect(write=True) as db:
            db.execute(
                "UPDATE evaluation_runs SET status='failed',error=?,usage=?,finished_at=?,retry_count=? WHERE id=?",
                (error, dump(usage), now(), max(0, usage["attempts"] - 1), row["id"]),
            )

    def finish_usage(self, usage, started):
        usage["latency_ms"] = round((time.monotonic() - started) * 1000)
        if self.settings.input_rate and self.settings.output_rate:
            # Output pricing includes reasoning tokens, not just visible JSON.
            estimated = (
                Decimal(usage["input_tokens"]) * Decimal(self.settings.input_rate)
                + Decimal(usage["output_tokens"] + usage["thinking_tokens"])
                * Decimal(self.settings.output_rate)
            ) / Decimal(1000000)
            usage["estimated_cost_usd"] = str(estimated.quantize(Decimal(".000001")))
        usage["cost_note"] = (
            "Configured rates; includes all measured calls and reasoning. Failed requests may have unreported billable usage."
        )
