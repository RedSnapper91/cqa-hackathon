"""Explicit test harness. Never use for demos of real AI or organizer data."""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
if os.getenv("CQA_E2E_TEST") != "1":
    raise SystemExit(
        "This harness requires CQA_E2E_TEST=1 and is for automated tests only."
    )
from backend.app.main import create_app
from backend.app.settings import Settings
from backend.tests.conftest import FakeProvider

app = create_app(
    Settings(
        database_url="sqlite:///.private/team-e2e.db"
        if os.getenv("CQA_E2E_TARGET") == "team"
        else "sqlite:///.private/e2e.db",
        testing=True,
        gemini_api_key="",
        organizer_url="",
        parallel=2,
    ),
    FakeProvider(),
)
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8012 if os.getenv("CQA_E2E_TARGET") == "team" else 8011,
        log_level="warning",
    )
