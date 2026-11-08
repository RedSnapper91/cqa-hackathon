import copy
import pytest
from pydantic import ValidationError
from backend.app.services.validator import validate_draft
from backend.app.schemas import ChecklistCreate
from backend.tests.conftest import fake_draft


@pytest.fixture
def context(seed):
    conv = {
        "external_id": "x",
        "language": "KZ",
        "messages": [
            {
                "id": "m1",
                "ordinal": 0,
                "text": "Сәлеметсіз бе!",
                "speaker": "client",
                "timestamp": "00:00",
            },
            {
                "id": "m2",
                "ordinal": 1,
                "text": "Сәлеметсіз бе! Менің атым Айдана.",
                "speaker": "operator",
                "timestamp": "00:01",
            },
        ],
    }
    checklist = {**seed, "id": "v1"}
    return conv, checklist, fake_draft(conv, checklist)


@pytest.mark.parametrize(
    "mode",
    [
        "missing",
        "duplicate",
        "unknown",
        "scale4",
        "scale6",
        "na1",
        "na5",
        "na6",
        "na8",
        "bad_evidence",
        "reversed_span",
        "bad_span",
        "no_reason",
        "flag_score",
        "wrong_metadata",
        "false_quote",
        "omission_span",
        "binary_answer",
        "numeric_answer",
    ],
)
def test_reject_invalid_output(context, mode):
    conv, checklist, draft = context
    j = draft["criteria"]
    if mode == "missing":
        j.pop()
    elif mode == "duplicate":
        j.append(copy.deepcopy(j[0]))
    elif mode == "unknown":
        j[0]["criterion_id"] = "UNKNOWN"
    elif mode == "scale4":
        j[3]["raw_score"] = 16
    elif mode == "scale6":
        j[5]["raw_score"] = 8
    elif mode.startswith("na"):
        n = int(mode[2:]) - 1
        j[n].update(status="na", answer="N/A", raw_score=None, na_reason="Test reason")
    elif mode == "bad_evidence":
        j[0]["evidence_message_ids"] = ["missing"]
    elif mode == "reversed_span":
        j[0]["checked_span"] = {"start_message_id": "m2", "end_message_id": "m1"}
    elif mode == "bad_span":
        j[0]["checked_span"] = {"start_message_id": "missing", "end_message_id": "m2"}
    elif mode == "no_reason":
        j[0]["reason"] = "  "
    elif mode == "flag_score":
        j[-1]["raw_score"] = 0
    elif mode == "wrong_metadata":
        draft["language"] = "EN"
    elif mode == "false_quote":
        j[0]["quotes"] = [{"message_id": "m2", "quote": "Invented English translation"}]
    elif mode == "omission_span":
        j[0].update(omission=True, checked_span=None)
    elif mode == "binary_answer":
        j[0]["answer"] = "Нет"
    elif mode == "numeric_answer":
        j[3]["answer"] = "19"
    with pytest.raises((ValueError, ValidationError)):
        validate_draft(draft, conv, checklist)


def test_na_original_script_and_fact_review(context):
    conv, checklist, draft = context
    draft["criteria"][2].update(
        status="na", answer="N/A", raw_score=None, na_reason="Жалпы сұрақ"
    )
    draft["criteria"][3]["fact_verification_needed"] = True
    draft["criteria"][0]["quotes"] = [
        {"message_id": "m2", "quote": "Менің атым Айдана."}
    ]
    result = validate_draft(draft, conv, checklist)
    assert result.criteria[3].review_required


@pytest.mark.parametrize(
    "change",
    [
        {"weight": -1},
        {"weight": float("inf")},
        {"kind": "flag", "weight": 1},
        {"allowed_scores": [0, 1, 1]},
        {"na_allowed": True, "na_rule": ""},
        {"max_score": 2},
    ],
)
def test_invalid_checklist(seed, change):
    seed["criteria"][0].update(change)
    with pytest.raises(ValidationError):
        ChecklistCreate.model_validate(seed)


def test_boolean_cannot_masquerade_as_numeric_score(context):
    conversation, checklist, draft = context
    draft["criteria"][0]["raw_score"] = True
    with pytest.raises(ValidationError):
        validate_draft(draft, conversation, checklist)
