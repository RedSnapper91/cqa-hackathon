import json
import time
import pytest
from fastapi.testclient import TestClient
from backend.app.main import create_app
from backend.app.settings import Settings, ROOT
from backend.app.services.llm_provider import ProviderResponse


@pytest.fixture
def seed():
    return json.loads((ROOT / "config/official_checklist_v1.json").read_text())


@pytest.fixture
def payload():
    data = json.loads((ROOT / "config/synthetic_demo.json").read_text())
    data["data"]["records"] = data["data"]["records"][:3]
    data["data"]["total_records"] = 3
    return data


def fake_draft(conversation, checklist):
    messages = conversation["messages"]
    operator = next((m for m in messages if m["speaker"] == "operator"), messages[0])
    judgments = []
    for c in checklist["criteria"]:
        if not c.get("active", True):
            continue
        raw = None if c["kind"] == "flag" else c["max_score"]
        answer = (
            c["no_label"]
            if c["kind"] == "flag"
            else c["yes_label"]
            if c["kind"] == "binary"
            else f"{raw:g}"
        )
        judgments.append(
            dict(
                criterion_id=c["id"],
                status="scored",
                answer=answer,
                raw_score=raw,
                reason="TEST FIXTURE ONLY — not an AI or human quality assessment.",
                na_reason=None,
                evidence_message_ids=[operator["id"]],
                checked_span={
                    "start_message_id": messages[0]["id"],
                    "end_message_id": messages[-1]["id"],
                },
                omission=False,
                quotes=[],
                review_required=False,
                fact_verification_needed=False,
            )
        )
    return dict(
        conversation_id=conversation["external_id"],
        checklist_version_id=checklist["id"],
        language=conversation["language"],
        criteria=judgments,
        provider_warnings=["DETERMINISTIC TEST FIXTURE — NOT REAL AI OUTPUT"],
    )


class FakeProvider:
    name = "test-only"
    model = "deterministic-fixture"
    calls = 0

    async def evaluate(self, conversation, checklist, feedback=""):
        self.calls += 1
        return ProviderResponse(
            json.dumps(fake_draft(conversation, checklist)), 100, 30, 10, 140
        )


@pytest.fixture
def settings(tmp_path):
    return Settings(
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        gemini_api_key="",
        organizer_url="",
        testing=True,
        parallel=2,
    )


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings, FakeProvider())) as client:
        yield client


def import_payload(client, payload):
    response = client.post(
        "/api/datasets/import-json",
        files={"file": ("fixture.json", json.dumps(payload), "application/json")},
    )
    assert response.status_code == 200, response.text
    return client.get("/api/conversations?size=100").json()["items"]


def wait_run(client, rid):
    for _ in range(200):
        result = client.get("/api/evaluations/" + rid).json()
        if result["status"] in ("completed", "failed"):
            return result
        time.sleep(0.03)
    raise AssertionError("Evaluation did not finish")


@pytest.fixture
def completed(client, payload):
    convs = import_payload(client, payload)
    run = client.post(
        "/api/evaluations",
        json={"conversation_id": convs[0]["id"], "checklist_version_id": "v1"},
    )
    assert run.status_code == 202, run.text
    result = wait_run(client, run.json()["id"])
    assert result["status"] == "completed", result
    return convs[0], result
