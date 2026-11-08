"""Export evaluations to the organizers' results format (JSON 1.0).

Usage: python scripts/export_results.py <group_id> <out_path> [--team NAME]
Example: python scripts/export_results.py FBroker results/prod/results.json

Takes the latest completed run of each conversation in the group (final values,
after any review). Conversations without a completed run are written with
status "error", as the appendix requires.
"""

import argparse
import json
import sqlite3
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CODES = {
    "C01": "contact",
    "C02": "discovery",
    "C03": "identification",
    "C04": "consultation",
    "C05": "empathy",
    "C06": "dialogue",
    "C07": "closure",
    "C08": "critical",
}
YES = {"да", "yes", "иә"}
NO = {"нет", "no", "жоқ"}

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("group_id")
parser.add_argument("out", type=Path)
parser.add_argument("--team", default="RedSnapper91 / cqa-hackathon")
parser.add_argument("--db", type=Path, default=ROOT / "cqa.db")
args = parser.parse_args()

db = sqlite3.connect(args.db)
db.row_factory = sqlite3.Row
models = set()


def turn(message_id):
    # Message ids are "<conversation>:m0001" — 1-based position in the source transcript.
    return int(message_id.rsplit(":m", 1)[1])


def value(c):
    if c["status"] == "na":
        return None
    if c["criterion_id"] in ("C04", "C06"):
        return int(Decimal(str(c["raw_score"])))
    if c.get("raw_score") is not None and c["criterion_id"] != "C08":
        return float(c["raw_score"]) > 0
    answer = str(c.get("answer", "")).strip().lower()
    if answer in YES:
        return True
    if answer in NO:
        return False
    raise ValueError(f"Unexpected answer for {c['criterion_id']}: {c.get('answer')!r}")


results = []
conversations = db.execute(
    "SELECT id, external_id FROM conversations WHERE group_id=? ORDER BY external_id",
    (args.group_id,),
).fetchall()
if not conversations:
    raise SystemExit(f"No conversations in group {args.group_id}")
for conv in conversations:
    run = db.execute(
        "SELECT final, model FROM evaluation_runs WHERE conversation_id=? AND status='completed'"
        " ORDER BY finished_at DESC LIMIT 1",
        (conv["id"],),
    ).fetchone()
    if not run:
        last = db.execute(
            "SELECT error FROM evaluation_runs WHERE conversation_id=? ORDER BY created_at DESC LIMIT 1",
            (conv["id"],),
        ).fetchone()
        results.append(
            {
                "conversation_id": conv["external_id"],
                "status": "error",
                "criteria": [],
                "score": None,
                "error": (last["error"] if last and last["error"] else "Не удалось получить ответ модели."),
            }
        )
        continue
    models.add(run["model"])
    final = json.loads(run["final"])
    by_id = {c["criterion_id"]: c for c in final["criteria"]}
    criteria = []
    for code, name in CODES.items():
        c = by_id[code]
        criteria.append(
            {
                "criterion_id": name,
                "value": value(c),
                "rationale": (c.get("reason") or c.get("na_reason") or "").strip(),
                "evidence_turns": sorted({turn(m) for m in c.get("evidence_message_ids") or []}),
            }
        )
    critical = next(x["value"] for x in criteria if x["criterion_id"] == "critical")
    score = float(Decimal(str(final["score"])).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    results.append(
        {
            "conversation_id": conv["external_id"],
            "status": "ok",
            "criteria": criteria,
            "score": {"final_score": score, "critical_flag": bool(critical)},
        }
    )

ids = [r["conversation_id"] for r in results]
assert len(ids) == len(set(ids)), "duplicate conversation ids"
out = {
    "schema_version": "1.0",
    "team_name": args.team,
    "model": {"mode": "external_api", "name": ", ".join(sorted(models)) or "gemini-3.8-flash"},
    "results": results,
}
args.out.parent.mkdir(parents=True, exist_ok=True)
args.out.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
ok = sum(r["status"] == "ok" for r in results)
print(f"{args.out}: {len(results)} records, {ok} ok, {len(results) - ok} error")
