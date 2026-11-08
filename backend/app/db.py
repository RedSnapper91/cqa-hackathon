"""SQLite schema v1. Connections are short-lived; every write is transactional."""

from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
import json
import sqlite3
import uuid
from .settings import ROOT


def now():
    return datetime.now(timezone.utc).isoformat()


def uid(prefix):
    return f"{prefix}_{uuid.uuid4().hex}"


def dump(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


SCHEMA = """
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY);
INSERT OR IGNORE INTO schema_version VALUES(1);
CREATE TABLE IF NOT EXISTS preferences(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dataset_groups(
 id TEXT PRIMARY KEY, source TEXT NOT NULL, imported_at TEXT NOT NULL,
 reported_count INTEGER NOT NULL, import_status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS conversations(
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES dataset_groups(id), external_id TEXT NOT NULL,
 language TEXT NOT NULL CHECK(language IN ('RU','KZ','EN')),
 channel TEXT NOT NULL CHECK(channel IN ('agent chat','voice call')),
 audio_url TEXT, imported_at TEXT NOT NULL, source_json TEXT NOT NULL, content_hash TEXT NOT NULL,
 UNIQUE(group_id,external_id));
CREATE TABLE IF NOT EXISTS messages(
 id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id), ordinal INTEGER NOT NULL,
 timestamp TEXT NOT NULL, speaker TEXT NOT NULL CHECK(speaker IN ('client','operator','bot','system')),
 text TEXT NOT NULL, UNIQUE(conversation_id,ordinal));
CREATE INDEX IF NOT EXISTS ix_messages_conversation ON messages(conversation_id);
CREATE TABLE IF NOT EXISTS checklists(id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS checklist_versions(
 id TEXT PRIMARY KEY, checklist_id TEXT NOT NULL REFERENCES checklists(id), version INTEGER NOT NULL,
 parent_id TEXT REFERENCES checklist_versions(id), created_at TEXT NOT NULL, config TEXT NOT NULL,
 UNIQUE(checklist_id,version));
CREATE TRIGGER IF NOT EXISTS immutable_checklist_update BEFORE UPDATE ON checklist_versions
 BEGIN SELECT RAISE(ABORT,'Checklist versions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_checklist_delete BEFORE DELETE ON checklist_versions
 BEGIN SELECT RAISE(ABORT,'Checklist versions are immutable'); END;
CREATE TABLE IF NOT EXISTS batch_jobs(
 id TEXT PRIMARY KEY, checklist_version_id TEXT NOT NULL REFERENCES checklist_versions(id),
 created_at TEXT NOT NULL, group_id TEXT);
CREATE TABLE IF NOT EXISTS evaluation_runs(
 id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id),
 checklist_version_id TEXT NOT NULL REFERENCES checklist_versions(id),
 status TEXT NOT NULL CHECK(status IN ('queued','processing','completed','failed')),
 provider TEXT NOT NULL, model TEXT NOT NULL, created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT,
 snapshot TEXT NOT NULL, original TEXT, final TEXT, usage TEXT, error TEXT, warnings TEXT NOT NULL DEFAULT '[]',
 retry_count INTEGER NOT NULL DEFAULT 0, attempt_count INTEGER NOT NULL DEFAULT 0,
 raw_response TEXT, batch_id TEXT REFERENCES batch_jobs(id));
CREATE INDEX IF NOT EXISTS ix_run_conversation_version ON evaluation_runs(conversation_id,checklist_version_id,created_at);
CREATE INDEX IF NOT EXISTS ix_run_status ON evaluation_runs(status,created_at);
CREATE TABLE IF NOT EXISTS criterion_evaluations(
 run_id TEXT NOT NULL REFERENCES evaluation_runs(id), criterion_id TEXT NOT NULL,
 original TEXT NOT NULL, PRIMARY KEY(run_id,criterion_id));
CREATE TRIGGER IF NOT EXISTS immutable_criterion_update BEFORE UPDATE ON criterion_evaluations
 BEGIN SELECT RAISE(ABORT,'AI judgments are immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_criterion_delete BEFORE DELETE ON criterion_evaluations
 BEGIN SELECT RAISE(ABORT,'AI judgments are immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_run_original BEFORE UPDATE OF original,snapshot,checklist_version_id,conversation_id ON evaluation_runs
 WHEN (OLD.original IS NOT NULL AND NEW.original IS NOT OLD.original)
   OR NEW.snapshot IS NOT OLD.snapshot
   OR NEW.checklist_version_id IS NOT OLD.checklist_version_id
   OR NEW.conversation_id IS NOT OLD.conversation_id
 BEGIN SELECT RAISE(ABORT,'Original evaluation and source association are immutable'); END;
CREATE TABLE IF NOT EXISTS appeals(
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES evaluation_runs(id), criterion_id TEXT NOT NULL,
 actor TEXT NOT NULL, comment TEXT NOT NULL, created_at TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','confirmed','changed')),
 FOREIGN KEY(run_id,criterion_id) REFERENCES criterion_evaluations(run_id,criterion_id));
CREATE UNIQUE INDEX IF NOT EXISTS ix_pending_appeal ON appeals(run_id,criterion_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS ix_appeal_status ON appeals(status,created_at);
CREATE TABLE IF NOT EXISTS review_decisions(
 id TEXT PRIMARY KEY, appeal_id TEXT NOT NULL UNIQUE REFERENCES appeals(id),
 reviewer TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL,
 before_judgment TEXT NOT NULL, after_judgment TEXT NOT NULL, before_score TEXT, after_score TEXT);
CREATE TRIGGER IF NOT EXISTS immutable_review_update BEFORE UPDATE ON review_decisions
 BEGIN SELECT RAISE(ABORT,'Review decisions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_review_delete BEFORE DELETE ON review_decisions
 BEGIN SELECT RAISE(ABORT,'Review decisions are immutable'); END;
"""


class Database:
    def __init__(self, url):
        if not url.startswith("sqlite:///"):
            raise ValueError(
                "This local build supports SQLite DATABASE_URL (sqlite:///path)"
            )
        self.path = url.removeprefix("sqlite:///")
        Path(self.path).resolve().parent.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def connect(self, write=False):
        connection = sqlite3.connect(self.path, timeout=20)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        try:
            if write:
                connection.execute("BEGIN IMMEDIATE")
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def initialize(self):
        with self.connect() as db:
            Path(self.path).chmod(0o600)
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript(SCHEMA)
            if not db.execute("SELECT 1 FROM checklist_versions").fetchone():
                seed = json.loads(
                    (ROOT / "config/official_checklist_v1.json").read_text()
                )
                db.execute(
                    "INSERT INTO checklists VALUES(?,?)", ("official", seed["name"])
                )
                db.execute(
                    "INSERT INTO checklist_versions VALUES(?,?,?,?,?,?)",
                    ("v1", "official", 1, None, now(), dump(seed)),
                )
            db.execute(
                "UPDATE evaluation_runs SET status='failed',error='Worker interrupted by server restart; retry is available.',finished_at=? WHERE status='processing'",
                (now(),),
            )

    def one(self, sql, args=()):
        with self.connect() as db:
            row = db.execute(sql, args).fetchone()
            return dict(row) if row else None

    def all(self, sql, args=()):
        with self.connect() as db:
            return [dict(r) for r in db.execute(sql, args).fetchall()]
