import copy
import json
import time
import pytest
from fastapi.testclient import TestClient
from backend.app.main import create_app
from backend.app.services.llm_provider import ProviderResponse, SYSTEM_INSTRUCTION
from backend.app.services.dataset_import import group_url
from backend.tests.conftest import import_payload, wait_run, FakeProvider


def test_import_idempotent_and_roles(client, payload):
    items = import_payload(client, payload)
    messages = client.get("/api/conversations/" + items[0]["id"]).json()["messages"]
    assert {m["speaker"] for m in messages} == {"operator", "client", "bot", "system"}
    assert messages[0]["timestamp"] == "00:00"
    again = client.post(
        "/api/datasets/import-json",
        files={"file": ("fixture.json", json.dumps(payload))},
    )
    assert again.json()["unchanged"] == 3 and again.json()["inserted"] == 0
    assert (
        client.get("/api/conversations/" + items[0]["id"]).json()["messages"]
        == messages
    )
    new = copy.deepcopy(payload)
    new["data"]["dataset_group_id"] = "CONTROL"
    assert len(import_payload(client, new)) == 6
    changed = copy.deepcopy(payload)
    changed["data"]["records"][0]["transcript"][0]["text"] = "Changed"
    response = client.post(
        "/api/datasets/import-json",
        files={"file": ("changed.json", json.dumps(changed))},
    )
    assert response.status_code == 400
    assert (
        client.get("/api/conversations/" + items[0]["id"]).json()["messages"]
        == messages
    )


def test_call_timestamps_and_demo(client):
    assert client.post("/api/datasets/demo").status_code == 200
    calls = client.get("/api/conversations?channel=voice%20call").json()["items"]
    call = client.get("/api/conversations/" + calls[0]["id"]).json()
    assert call["messages"][0]["timestamp"] == "2026-11-01T10:00:00+05:00"
    assert call["audio_url"].startswith("https://")
    assert client.get("/api/dashboard").json()["languages"] == {
        "RU": 3,
        "KZ": 3,
        "EN": 4,
    }


@pytest.mark.parametrize(
    "mode",
    [
        "false",
        "missing",
        "count",
        "invalid_language",
        "bad_timestamp",
        "bad_role",
        "bad_audio",
        "empty_transcript",
    ],
)
def test_import_errors(client, payload, mode):
    if mode == "false":
        payload["isSuccess"] = False
        payload["error"] = "private signed data"
    elif mode == "missing":
        del payload["data"]["records"][0]["audio_url"]
    elif mode == "count":
        payload["data"]["total_records"] = 7
    elif mode == "invalid_language":
        payload["data"]["records"][0]["language"] = "FR"
    elif mode == "bad_timestamp":
        payload["data"]["records"][0]["transcript"][0]["timestamp"] = "yesterday"
    elif mode == "bad_role":
        payload["data"]["records"][0]["transcript"][0]["speaker"] = "assistant"
    elif mode == "bad_audio":
        payload["data"]["records"][0]["audio_url"] = "javascript:alert(1)"
    elif mode == "empty_transcript":
        payload["data"]["records"][0]["transcript"] = []
    response = client.post(
        "/api/datasets/import-json",
        files={"file": ("fixture.json", json.dumps(payload))},
    )
    assert response.status_code in (400, 422)
    assert client.get("/api/conversations").json()["total"] == 0


def test_empty_dataset(client):
    assert (
        client.post(
            "/api/datasets/import-json",
            files={
                "file": (
                    "empty.json",
                    json.dumps(
                        {
                            "error": "",
                            "isSuccess": True,
                            "data": {
                                "dataset_group_id": "EMPTY",
                                "total_records": 0,
                                "records": [],
                            },
                        }
                    ),
                )
            },
        ).status_code
        == 200
    )
    assert client.get("/api/dashboard").json()["imported"] == 0


def test_appeal_change_preserves_original_and_reload(client, completed):
    conv, run = completed
    assert run["original"]["score"] == "100.00"
    missing = client.post(
        "/api/appeals",
        json={"run_id": run["id"], "criterion_id": "C01", "comment": " "},
    )
    assert missing.status_code == 422
    appeal = client.post(
        "/api/appeals",
        json={
            "run_id": run["id"],
            "criterion_id": "C01",
            "comment": "Opening should not receive full credit.",
        },
    ).json()
    assert (
        client.post(
            "/api/appeals",
            json={"run_id": run["id"], "criterion_id": "C01", "comment": "Duplicate"},
        ).status_code
        == 409
    )
    url = "/api/appeals/" + appeal["id"] + "/decision"
    assert (
        client.post(url, json={"action": "confirm", "reason": " "}).status_code == 422
    )
    judgment = copy.deepcopy(appeal["original_judgment"])
    judgment.update(
        answer="Нет",
        raw_score=0,
        omission=True,
        reason="Required introduction missing in test case.",
    )
    response = client.post(
        url,
        json={
            "action": "change",
            "reason": "Reviewed opening evidence",
            "judgment": judgment,
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["decision"]["before_score"] == "100.00"
    assert response.json()["decision"]["after_score"] == "90.00"
    final = client.get("/api/evaluations/" + run["id"]).json()
    assert final["original"] == run["original"]
    assert final["final"]["score"] == "90.00"
    assert (
        client.get("/api/appeals?status=changed").json()[0]["decision"]["reason"]
        == "Reviewed opening evidence"
    )
    assert (
        client.post(url, json={"action": "confirm", "reason": "again"}).status_code
        == 409
    )
    assert final["provider"] == "test-only"


def test_reviewer_allowed_scale_and_na(client, completed):
    _, run = completed
    appeal = client.post(
        "/api/appeals",
        json={"run_id": run["id"], "criterion_id": "C04", "comment": "Check content"},
    ).json()
    judgment = copy.deepcopy(appeal["original_judgment"])
    judgment.update(raw_score=16, answer="16")
    url = "/api/appeals/" + appeal["id"] + "/decision"
    assert (
        client.post(
            url, json={"action": "change", "reason": "Review", "judgment": judgment}
        ).status_code
        == 400
    )
    judgment.update(
        status="na", raw_score=None, answer="N/A", na_reason="Test request absent"
    )
    response = client.post(
        url,
        json={
            "action": "change",
            "reason": "Checked applicability",
            "judgment": judgment,
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["final_score"] == "100.00"
    assert response.json()["original_judgment"]["raw_score"] == 20


def test_confirm_appeal(client, completed):
    _, run = completed
    appeal = client.post(
        "/api/appeals",
        json={
            "run_id": run["id"],
            "criterion_id": "C03",
            "comment": "Check identity requirement",
        },
    ).json()
    response = client.post(
        "/api/appeals/" + appeal["id"] + "/decision",
        json={"action": "confirm", "reason": "Evidence supports original judgment"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "confirmed"
    assert response.json()["final_score"] == run["final"]["score"]


def test_dynamic_version_and_comparison(client, completed, seed):
    conv, run = completed
    new = copy.deepcopy(seed)
    new["parent_id"] = "v1"
    new["criteria"][0]["title"] = "Новый критерий"
    extra = copy.deepcopy(new["criteria"][0])
    extra["id"] = "CUSTOM"
    extra["description"] = "Проверьте новое поведение оператора без изменения кода."
    new["criteria"].append(extra)
    saved = client.post("/api/checklists", json=new)
    assert saved.status_code == 201, saved.text
    v2 = saved.json()
    assert v2["version"] == 2
    assert (
        client.get("/api/checklists/v1").json()["criteria"][0]["title"]
        == seed["criteria"][0]["title"]
    )
    before = client.get(
        f"/api/conversations/{conv['id']}/compare",
        params={"version_a": "v1", "version_b": v2["id"]},
    ).json()
    assert before["b"]["evaluation"] is None
    rid = client.post(
        "/api/evaluations",
        json={"conversation_id": conv["id"], "checklist_version_id": v2["id"]},
    ).json()["id"]
    final = wait_run(client, rid)
    assert final["status"] == "completed" and len(final["final"]["criteria"]) == 9
    compared = client.get(
        f"/api/conversations/{conv['id']}/compare",
        params={"version_a": "v1", "version_b": v2["id"]},
    ).json()
    assert (
        compared["a"]["evaluation"]["id"] == run["id"]
        and compared["b"]["evaluation"]["id"] == rid
    )
    assert (
        len(client.get("/api/conversations/" + conv["id"] + "/evaluations").json()) == 2
    )
    assert (
        client.post("/api/checklists/" + v2["id"] + "/duplicate").json()["version"] == 3
    )


def test_batch_persistence_and_progress(client, payload):
    items = import_payload(client, payload)
    response = client.post(
        "/api/evaluations/batch",
        json={"group_id": "SYNTHETIC_DEMO", "checklist_version_id": "v1"},
    )
    assert response.status_code == 202, response.text
    bid = response.json()["id"]
    for _ in range(100):
        job = client.get("/api/batches/" + bid).json()
        if job["status"] == "completed":
            break
        time.sleep(0.04)
    assert job["counts"]["completed"] == len(items) and job["finished"] == job["total"]
    assert client.get("/api/batches").json()[0]["id"] == bid


def test_invalid_output_retried_not_scored(settings, payload):
    class Invalid(FakeProvider):
        async def evaluate(self, conversation, checklist, feedback=""):
            return ProviderResponse("{}", 10, 10)

    with TestClient(create_app(settings, Invalid())) as client:
        conv = import_payload(client, payload)[0]
        bid = client.post(
            "/api/evaluations/batch",
            json={"conversation_ids": [conv["id"]], "checklist_version_id": "v1"},
        ).json()["id"]
        rid = client.get("/api/batches/" + bid).json()["items"][0]["id"]
        run = wait_run(client, rid)
        assert run["status"] == "failed" and run["final"] is None
        assert run["usage"]["attempts"] == 3 and run["usage"]["input_tokens"] == 30
        retried = client.post("/api/batches/" + bid + "/retry")
        assert retried.status_code == 202 and retried.json()["id"] != bid


def test_secret_not_exposed_or_echoed(client):
    sentinel = "fake-signed-secret-123"
    result = client.post("/api/datasets/import", json={"group_id": "../" + sentinel})
    assert result.status_code == 422 and sentinel not in result.text
    result = client.post(
        "/api/datasets/import-json",
        files={
            "file": (
                "x.json",
                json.dumps({"error": sentinel, "isSuccess": False, "data": {}}),
            )
        },
    )
    assert sentinel not in result.text
    for path in (
        "/api/config/status",
        "/api/health",
        "/api/datasets",
        "/api/conversations",
    ):
        assert "sig=" not in client.get(path).text
    assert (
        "UNTRUSTED DATA" in SYSTEM_INSTRUCTION
        and "ONLY the operator" in SYSTEM_INSTRUCTION
    )
    url = group_url(
        "https://example.com/path?sig=opaque%2Bvalue%2f&group_id=DEV&sp=x", "CONTROL_2"
    )
    assert (
        url == "https://example.com/path?sig=opaque%2Bvalue%2f&sp=x&group_id=CONTROL_2"
    )


def test_no_key_no_fake_and_call_guard(settings, payload):
    settings.testing = False
    with TestClient(create_app(settings)) as client:
        conv = import_payload(client, payload)[0]
        result = client.post(
            "/api/evaluations",
            json={"conversation_id": conv["id"], "checklist_version_id": "v1"},
        )
        assert (
            result.status_code == 503
            and client.get("/api/evaluations").json()["total"] == 0
        )
    with pytest.raises(ValueError):
        create_app(settings, FakeProvider())
    settings.gemini_api_key = "server-only-test-key"
    with TestClient(create_app(settings)) as client:
        client.post("/api/datasets/demo")
        call = client.get("/api/conversations?channel=voice%20call").json()["items"][0]
        assert (
            client.post(
                "/api/evaluations",
                json={"conversation_id": call["id"], "checklist_version_id": "v1"},
            ).status_code
            == 403
        )
        assert "server-only-test-key" not in client.get("/api/config/status").text
