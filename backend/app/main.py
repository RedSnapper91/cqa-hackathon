from contextlib import asynccontextmanager
import json
import sqlite3
from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from .settings import Settings, ROOT
from .db import Database, now, dump, uid
from .schemas import (
    ChecklistCreate,
    GroupRequest,
    EvaluateRequest,
    BatchRequest,
    AppealCreate,
    DecisionCreate,
    Judgment,
    ChecklistSelection,
)
from .services.dataset_import import import_dataset, fetch_dataset, MAX_BYTES
from .services.evaluation_engine import (
    EvaluationEngine,
    conversation_snapshot,
    checklist_from_row,
    public_run,
)
from .services.llm_provider import GeminiProvider
from .services.scorer import calculate
from .services.validator import validate_draft


def create_app(settings=None, provider=None):
    settings = settings or Settings()
    if provider is not None and not settings.testing:
        raise ValueError("Provider injection is allowed in test mode only")
    database = Database(settings.database_url)
    provider = provider or GeminiProvider(settings)
    engine = EvaluationEngine(database, settings, provider)

    @asynccontextmanager
    async def lifespan(app):
        database.initialize()
        await engine.start()
        yield
        await engine.stop()

    app = FastAPI(title="CQA Intelligence", version="1.0.0", lifespan=lifespan)
    app.state.database, app.state.settings, app.state.engine = (
        database,
        settings,
        engine,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(RequestValidationError)
    async def request_error(request, exc):
        errors = [
            {"location": list(e["loc"]), "message": e["msg"]} for e in exc.errors()
        ]
        return JSONResponse(status_code=422, content={"detail": errors})

    @app.exception_handler(ValidationError)
    async def validation_error(request, exc):
        errors = [
            {"location": list(e["loc"]), "message": e["msg"]}
            for e in exc.errors(include_input=False)
        ]
        return JSONResponse(status_code=422, content={"detail": errors})

    @app.exception_handler(ValueError)
    async def value_error(request, exc):
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(sqlite3.IntegrityError)
    async def conflict_error(request, exc):
        return JSONResponse(
            status_code=409,
            content={
                "detail": "Conflicting operation; a pending appeal or immutable record already exists."
            },
        )

    def require(row, message="Record not found"):
        if row is None:
            raise HTTPException(404, message)
        return row

    def version(vid):
        return checklist_from_row(
            require(
                database.one("SELECT * FROM checklist_versions WHERE id=?", (vid,)),
                "Checklist version not found",
            )
        )

    def latest(cid, vid=None):
        sql = "SELECT r.*,v.version checklist_number FROM evaluation_runs r JOIN checklist_versions v ON v.id=r.checklist_version_id WHERE r.conversation_id=?"
        args = [cid]
        if vid:
            sql += " AND checklist_version_id=?"
            args.append(vid)
        return public_run(
            database.one(sql + " ORDER BY r.created_at DESC,r.rowid DESC LIMIT 1", args)
        )

    def check_evaluation_setup(conversations):
        if not settings.testing and not settings.gemini_api_key:
            raise HTTPException(
                503,
                "Evaluation needs GEMINI_API_KEY in the backend .env. Import and checklist editing are available.",
            )
        if (
            not settings.testing
            and not settings.allow_calls
            and any(c["channel"] == "voice call" for c in conversations)
        ):
            raise HTTPException(
                403,
                "Voice transcript processing requires explicit authorization. Set ALLOW_EXTERNAL_LLM_FOR_REAL_CALLS=true only after authorization; or batch text chats only.",
            )

    @app.get("/api/health")
    def health():
        return {"status": "ok", "schema_version": 1}

    @app.get("/api/config/status")
    def config_status():
        return {
            "provider": provider.name,
            "model": provider.model,
            "llm_configured": settings.testing or bool(settings.gemini_api_key),
            "organizer_configured": bool(settings.organizer_url),
            "test_mode": settings.testing,
            "external_call_processing_allowed": settings.allow_calls,
            "parallel_evaluations": settings.parallel,
            "pricing_configured": bool(settings.input_rate and settings.output_rate),
        }

    @app.post("/api/datasets/import")
    async def import_remote(body: GroupRequest):
        data = await fetch_dataset(settings, body.group_id)
        return import_dataset(database, data, "organizer", body.group_id)

    @app.post("/api/datasets/import-json")
    async def import_json(file: UploadFile = File(...)):
        content = await file.read(MAX_BYTES + 1)
        if len(content) > MAX_BYTES:
            raise HTTPException(413, "Maximum JSON file size is 20 MB")
        try:
            payload = json.loads(content)
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise HTTPException(422, "File must contain UTF-8 JSON") from None
        return import_dataset(database, payload)

    @app.post("/api/datasets/demo")
    def import_demo():
        return import_dataset(
            database,
            json.loads((ROOT / "config/synthetic_demo.json").read_text(encoding="utf-8")),
            "synthetic demo",
        )

    @app.get("/api/datasets")
    def datasets():
        return database.all("SELECT * FROM dataset_groups ORDER BY imported_at DESC")

    @app.get("/api/dashboard")
    def dashboard():
        conversations = database.all(
            "SELECT id,language,channel,group_id FROM conversations"
        )
        runs = [latest(c["id"]) for c in conversations]
        counts = {
            "imported": len(conversations),
            "evaluated": 0,
            "pending": 0,
            "processing": 0,
            "failed": 0,
            "flagged": 0,
            "review_required": 0,
        }
        for run in runs:
            if run is None:
                counts["pending"] += 1
            elif run["status"] == "completed":
                counts["evaluated"] += 1
                counts["flagged"] += int(run["final"]["gross_violation"])
                counts["review_required"] += int(
                    any(j["review_required"] for j in run["final"]["criteria"])
                )
            elif run["status"] in ("queued", "processing"):
                counts["processing"] += 1
            else:
                counts["failed"] += 1
        counts["appealed"] = database.one("SELECT COUNT(*) n FROM appeals")["n"]
        counts["reviewed"] = database.one(
            "SELECT COUNT(*) n FROM appeals WHERE status!='pending'"
        )["n"]
        counts["open_appeals"] = database.one(
            "SELECT COUNT(*) n FROM appeals WHERE status='pending'"
        )["n"]
        counts["languages"] = {
            lang: sum(c["language"] == lang for c in conversations)
            for lang in ("RU", "KZ", "EN")
        }
        counts["channels"] = {
            ch: sum(c["channel"] == ch for c in conversations)
            for ch in ("agent chat", "voice call")
        }
        return counts

    @app.get("/api/conversations")
    def conversations(
        group_id: str | None = None,
        language: str | None = None,
        channel: str | None = None,
        status: str | None = None,
        search: str = Query("", max_length=200),
        checklist_version_id: str | None = None,
        flagged: bool | None = None,
        min_score: float | None = Query(None, ge=0, le=100),
        max_score: float | None = Query(None, ge=0, le=100),
        page: int = Query(1, ge=1),
        size: int = Query(25, ge=1, le=100),
    ):
        where, args = [], []
        for field, value in (
            ("group_id", group_id),
            ("language", language),
            ("channel", channel),
        ):
            if value:
                where.append(f"c.{field}=?")
                args.append(value)
        if search:
            where.append(
                "(c.external_id LIKE ? OR EXISTS(SELECT 1 FROM messages m WHERE m.conversation_id=c.id AND m.text LIKE ?))"
            )
            args.extend([f"%{search}%", f"%{search}%"])
        sql = """SELECT c.id,c.group_id,c.external_id,c.language,c.channel,c.imported_at,
        (c.audio_url IS NOT NULL) has_audio,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id) message_count,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id AND m.speaker='operator') operator_messages,
        (SELECT substr(m.text,1,140) FROM messages m WHERE m.conversation_id=c.id AND m.speaker='client' ORDER BY m.ordinal LIMIT 1) preview
        FROM conversations c"""
        if where:
            sql += " WHERE " + " AND ".join(where)
        rows = database.all(sql + " ORDER BY c.external_id", args)
        results = []
        for row in rows:
            run = latest(row["id"], checklist_version_id)
            state = run["status"] if run else "pending"
            final = run["final"] if run and run["final"] else None
            if status and status != state:
                continue
            if (
                flagged is not None
                and bool(final and final["gross_violation"]) != flagged
            ):
                continue
            if min_score is not None and (
                not final or final["score"] is None or float(final["score"]) < min_score
            ):
                continue
            if max_score is not None and (
                not final or final["score"] is None or float(final["score"]) > max_score
            ):
                continue
            row["status"] = state
            row["latest_evaluation"] = (
                {
                    k: run[k]
                    for k in (
                        "id",
                        "checklist_version_id",
                        "checklist_number",
                        "status",
                        "finished_at",
                        "error",
                        "provider",
                        "model",
                    )
                }
                if run
                else None
            )
            row["score"] = final["score"] if final else None
            row["gross_violation"] = bool(final and final["gross_violation"])
            results.append(row)
        return {
            "items": results[(page - 1) * size : page * size],
            "total": len(results),
            "page": page,
            "size": size,
        }

    @app.get("/api/conversations/{cid}")
    def conversation(cid: str):
        result = require(conversation_snapshot(database, cid), "Conversation not found")
        result["latest_evaluation"] = latest(cid)
        return result

    @app.get("/api/conversations/{cid}/messages")
    def messages(cid: str):
        return require(conversation_snapshot(database, cid))["messages"]

    @app.get("/api/checklists")
    def checklists():
        return [
            checklist_from_row(r)
            for r in database.all(
                "SELECT * FROM checklist_versions ORDER BY version DESC"
            )
        ]

    @app.get("/api/preferences/checklist")
    def selected_checklist():
        selected = database.one(
            "SELECT value FROM preferences WHERE key='active_checklist'"
        )
        latest_version = database.one(
            "SELECT id FROM checklist_versions ORDER BY created_at DESC,rowid DESC LIMIT 1"
        )
        return {
            "checklist_version_id": selected["value"]
            if selected
            else latest_version["id"]
        }

    @app.post("/api/preferences/checklist")
    def select_checklist(body: ChecklistSelection):
        version(body.checklist_version_id)
        with database.connect(write=True) as db:
            db.execute(
                "INSERT INTO preferences VALUES('active_checklist',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (body.checklist_version_id,),
            )
        return {"checklist_version_id": body.checklist_version_id}

    @app.get("/api/checklists/{vid}")
    def checklist(vid: str):
        return version(vid)

    @app.post("/api/checklists", status_code=201)
    def save_checklist(body: ChecklistCreate):
        if body.parent_id:
            parent = require(
                database.one(
                    "SELECT * FROM checklist_versions WHERE id=?", (body.parent_id,)
                )
            )
            family = parent["checklist_id"]
        else:
            family = uid("checklist")
        with database.connect(write=True) as db:
            if not body.parent_id:
                db.execute("INSERT INTO checklists VALUES(?,?)", (family, body.name))
            number = db.execute(
                "SELECT COALESCE(MAX(version),0)+1 FROM checklist_versions WHERE checklist_id=?",
                (family,),
            ).fetchone()[0]
            vid = uid("version")
            config = {
                "name": body.name,
                "criteria": [c.model_dump() for c in body.criteria],
            }
            db.execute(
                "INSERT INTO checklist_versions VALUES(?,?,?,?,?,?)",
                (vid, family, number, body.parent_id, now(), dump(config)),
            )
        return version(vid)

    @app.post("/api/checklists/{vid}/duplicate", status_code=201)
    def duplicate_checklist(vid: str):
        old = version(vid)
        return save_checklist(
            ChecklistCreate(name=old["name"], parent_id=vid, criteria=old["criteria"])
        )

    @app.post("/api/evaluations", status_code=202)
    def evaluate(body: EvaluateRequest):
        version(body.checklist_version_id)
        conv = require(
            conversation_snapshot(database, body.conversation_id),
            "Conversation not found",
        )
        check_evaluation_setup([conv])
        with database.connect(write=True) as db:
            rid = engine.enqueue(db, body.conversation_id, body.checklist_version_id)
        return public_run(
            database.one("SELECT * FROM evaluation_runs WHERE id=?", (rid,))
        )

    @app.post("/api/evaluations/batch", status_code=202)
    def evaluate_batch(body: BatchRequest):
        version(body.checklist_version_id)
        if body.conversation_ids:
            ids = list(dict.fromkeys(body.conversation_ids))
            convs = [
                require(conversation_snapshot(database, cid), "Conversation not found")
                for cid in ids
            ]
        else:
            convs = database.all(
                "SELECT id,channel FROM conversations WHERE group_id=?",
                (body.group_id,),
            )
            ids = [c["id"] for c in convs]
        if not ids:
            raise HTTPException(400, "No conversations selected")
        check_evaluation_setup(convs)
        bid = uid("batch")
        with database.connect(write=True) as db:
            db.execute(
                "INSERT INTO batch_jobs VALUES(?,?,?,?)",
                (bid, body.checklist_version_id, now(), body.group_id),
            )
            for cid in ids:
                engine.enqueue(db, cid, body.checklist_version_id, bid)
        return batch(bid)

    @app.get("/api/batches")
    def batches():
        return [
            batch(r["id"])
            for r in database.all(
                "SELECT id FROM batch_jobs ORDER BY created_at DESC LIMIT 20"
            )
        ]

    @app.get("/api/batches/{bid}")
    def batch(bid: str):
        job = require(database.one("SELECT * FROM batch_jobs WHERE id=?", (bid,)))
        job["items"] = database.all(
            "SELECT r.id,r.conversation_id,c.external_id,r.status,r.error,r.retry_count FROM evaluation_runs r JOIN conversations c ON c.id=r.conversation_id WHERE batch_id=? ORDER BY r.created_at",
            (bid,),
        )
        job["counts"] = {
            s: sum(i["status"] == s for i in job["items"])
            for s in ("queued", "processing", "completed", "failed")
        }
        job["total"] = len(job["items"])
        job["finished"] = job["counts"]["completed"] + job["counts"]["failed"]
        job["status"] = (
            "running"
            if job["finished"] < job["total"]
            else "completed_with_errors"
            if job["counts"]["failed"]
            else "completed"
        )
        return job

    @app.post("/api/batches/{bid}/retry", status_code=202)
    def retry_batch(bid: str):
        batch(bid)
        failed = database.all(
            "SELECT conversation_id,checklist_version_id FROM evaluation_runs WHERE batch_id=? AND status='failed'",
            (bid,),
        )
        if not failed:
            raise HTTPException(400, "Batch has no failed items")
        # New runs preserve the failed provider attempts for audit.
        return evaluate_batch(
            BatchRequest(
                conversation_ids=[r["conversation_id"] for r in failed],
                checklist_version_id=failed[0]["checklist_version_id"],
            )
        )

    @app.get("/api/evaluations")
    def evaluations(page: int = Query(1, ge=1), size: int = Query(25, ge=1, le=100)):
        rows = database.all(
            "SELECT r.*,c.external_id,c.language FROM evaluation_runs r JOIN conversations c ON c.id=r.conversation_id ORDER BY r.created_at DESC LIMIT ? OFFSET ?",
            (size, (page - 1) * size),
        )
        return {
            "items": [public_run(r) for r in rows],
            "total": database.one("SELECT COUNT(*) n FROM evaluation_runs")["n"],
        }

    @app.get("/api/evaluations/{rid}")
    def evaluation(rid: str):
        result = public_run(
            require(
                database.one("SELECT * FROM evaluation_runs WHERE id=?", (rid,)),
                "Evaluation not found",
            )
        )
        result["checklist"] = version(result["checklist_version_id"])
        result["appeals"] = appeals(run_id=rid)
        return result

    @app.get("/api/conversations/{cid}/evaluations")
    def history(cid: str):
        require(database.one("SELECT id FROM conversations WHERE id=?", (cid,)))
        return [
            public_run(r)
            for r in database.all(
                "SELECT * FROM evaluation_runs WHERE conversation_id=? ORDER BY created_at DESC",
                (cid,),
            )
        ]

    @app.get("/api/conversations/{cid}/compare")
    def compare(cid: str, version_a: str, version_b: str):
        require(database.one("SELECT id FROM conversations WHERE id=?", (cid,)))
        return {
            "a": {
                "checklist": version(version_a),
                "evaluation": latest(cid, version_a),
            },
            "b": {
                "checklist": version(version_b),
                "evaluation": latest(cid, version_b),
            },
        }

    @app.post("/api/appeals", status_code=201)
    def create_appeal(body: AppealCreate):
        run = require(
            database.one("SELECT * FROM evaluation_runs WHERE id=?", (body.run_id,))
        )
        if run["status"] != "completed":
            raise HTTPException(409, "Only completed evaluations can be appealed")
        require(
            database.one(
                "SELECT * FROM criterion_evaluations WHERE run_id=? AND criterion_id=?",
                (body.run_id, body.criterion_id),
            ),
            "Criterion not found",
        )
        aid = uid("appeal")
        with database.connect(write=True) as db:
            db.execute(
                "INSERT INTO appeals VALUES(?,?,?,?,?,?,?)",
                (
                    aid,
                    body.run_id,
                    body.criterion_id,
                    body.actor,
                    body.comment,
                    now(),
                    "pending",
                ),
            )
        return appeal(aid)

    @app.get("/api/appeals")
    def appeals(status: str | None = None, run_id: str | None = None):
        where, args = [], []
        for field, value in (("status", status), ("run_id", run_id)):
            if value:
                where.append(f"{field}=?")
                args.append(value)
        rows = database.all(
            "SELECT id FROM appeals"
            + (" WHERE " + " AND ".join(where) if where else "")
            + " ORDER BY created_at DESC",
            args,
        )
        return [appeal(row["id"]) for row in rows]

    @app.get("/api/appeals/{aid}")
    def appeal(aid: str):
        item = require(database.one("SELECT * FROM appeals WHERE id=?", (aid,)))
        run = database.one(
            "SELECT * FROM evaluation_runs WHERE id=?", (item["run_id"],)
        )
        conv = database.one(
            "SELECT external_id FROM conversations WHERE id=?",
            (run["conversation_id"],),
        )
        item["conversation_id"], item["external_id"] = (
            run["conversation_id"],
            conv["external_id"],
        )
        item["original_judgment"] = json.loads(
            database.one(
                "SELECT original FROM criterion_evaluations WHERE run_id=? AND criterion_id=?",
                (item["run_id"], item["criterion_id"]),
            )["original"]
        )
        item["current_judgment"] = next(
            j
            for j in json.loads(run["final"])["criteria"]
            if j["criterion_id"] == item["criterion_id"]
        )
        item["original_score"], item["final_score"] = (
            json.loads(run["original"])["score"],
            json.loads(run["final"])["score"],
        )
        item["criterion"] = next(
            c
            for c in version(run["checklist_version_id"])["criteria"]
            if c["id"] == item["criterion_id"]
        )
        item["decision"] = database.one(
            "SELECT * FROM review_decisions WHERE appeal_id=?", (aid,)
        )
        if item["decision"]:
            for key in ("before_judgment", "after_judgment"):
                item["decision"][key] = json.loads(item["decision"][key])
        return item

    @app.post("/api/appeals/{aid}/decision")
    def decide(aid: str, body: DecisionCreate):
        # One transaction covers the decision and the deterministic recomputation.
        with database.connect(write=True) as db:
            item = require(
                db.execute("SELECT * FROM appeals WHERE id=?", (aid,)).fetchone()
            )
            if item["status"] != "pending":
                raise HTTPException(409, "Appeal has already been decided")
            run = dict(
                db.execute(
                    "SELECT * FROM evaluation_runs WHERE id=?", (item["run_id"],)
                ).fetchone()
            )
            checklist = version(run["checklist_version_id"])
            current = json.loads(run["final"])
            judgments = [
                {key: value for key, value in j.items() if key in Judgment.model_fields}
                for j in current["criteria"]
            ]
            index = next(
                i
                for i, j in enumerate(judgments)
                if j["criterion_id"] == item["criterion_id"]
            )
            before = judgments[index]
            after = body.judgment.model_dump() if body.action == "change" else before
            if after["criterion_id"] != item["criterion_id"]:
                raise HTTPException(422, "Decision targets the wrong criterion")
            judgments[index] = after
            snapshot = json.loads(run["snapshot"])
            draft = validate_draft(
                {
                    "conversation_id": snapshot["external_id"],
                    "checklist_version_id": checklist["id"],
                    "language": snapshot["language"],
                    "criteria": judgments,
                },
                snapshot,
                checklist,
            )
            final = calculate(
                checklist["criteria"], [j.model_dump() for j in draft.criteria]
            )
            db.execute(
                "INSERT INTO review_decisions VALUES(?,?,?,?,?,?,?,?,?,?)",
                (
                    uid("decision"),
                    aid,
                    body.reviewer,
                    body.action,
                    body.reason,
                    now(),
                    dump(before),
                    dump(after),
                    current["score"],
                    final["score"],
                ),
            )
            db.execute(
                "UPDATE appeals SET status=? WHERE id=?",
                ("changed" if body.action == "change" else "confirmed", aid),
            )
            db.execute(
                "UPDATE evaluation_runs SET final=? WHERE id=?",
                (dump(final), item["run_id"]),
            )
        return appeal(aid)

    # A production build is served by the same backend, with no frontend CORS hop.
    dist = ROOT / "frontend/dist"
    if dist.exists():
        app.mount(
            "/assets",
            StaticFiles(directory=dist / "assets", check_dir=False),
            name="assets",
        )

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            if path.startswith("api/"):
                raise HTTPException(404, "API route not found")
            return FileResponse(dist / "index.html")

    return app


app = create_app()
