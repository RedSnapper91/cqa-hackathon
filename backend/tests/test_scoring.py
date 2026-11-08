import copy
from decimal import Decimal
import pytest
from backend.app.schemas import ChecklistCreate
from backend.app.services.scorer import calculate


def full(seed, zero=False):
    return [
        dict(
            criterion_id=c["id"],
            status="scored",
            raw_score=None if c["kind"] == "flag" else 0 if zero else c["max_score"],
            answer="Нет" if zero or c["kind"] == "flag" else "Да",
        )
        for c in seed["criteria"]
    ]


def test_official_seed(seed):
    ChecklistCreate.model_validate(seed)
    assert [c["id"] for c in seed["criteria"]] == [f"C{i:02d}" for i in range(1, 9)]
    assert [c["weight"] for c in seed["criteria"]] == [10, 15, 20, 20, 15, 15, 5, 0]
    assert [c["id"] for c in seed["criteria"] if c["na_allowed"]] == [
        "C02",
        "C03",
        "C04",
        "C07",
    ]
    assert seed["criteria"][3]["allowed_scores"] == [0, 5, 10, 15, 20]
    assert seed["criteria"][5]["allowed_scores"] == [0, 4, 7, 10]
    assert len({c["section"] for c in seed["criteria"]}) == 4
    assert all(c["description"] and c["evidence_required"] for c in seed["criteria"])
    assert seed["criteria"][-1]["is_gross_violation_flag"]


@pytest.mark.parametrize("zero,expected", [(False, "100.00"), (True, "0.00")])
def test_extremes(seed, zero, expected):
    assert calculate(seed["criteria"], full(seed, zero))["score"] == expected


def test_exact_official_partial_case(seed):
    j = full(seed)
    j[2].update(status="na", raw_score=None, answer="N/A")
    j[3].update(raw_score=15)
    j[5].update(raw_score=7)
    j[6].update(raw_score=0, answer="Нет")
    result = calculate(seed["criteria"], j)
    assert result["score"] == "81.88"
    assert Decimal(result["earned"]) == Decimal("65.5")
    assert Decimal(result["denominator"]) == 80
    assert Decimal(result["criteria"][3]["contribution"]) == 15
    assert Decimal(result["criteria"][5]["contribution"]) == Decimal("10.5")
    assert result["sections"][seed["criteria"][-1]["section"]]["flag_only"]


def test_gross_flag_never_penalizes(seed):
    j = full(seed)
    j[-1]["answer"] = "Да"
    result = calculate(seed["criteria"], j)
    assert result["gross_violation"] is True and result["score"] == "100.00"
    assert result["criteria"][-1]["contribution"] is None


def test_dynamic_weights_and_zero_denominator(seed):
    criteria = copy.deepcopy(seed["criteria"][:2])
    criteria[0]["weight"] = 3
    criteria[1]["weight"] = 7
    j = full({"criteria": criteria})
    j[1]["raw_score"] = 0
    assert calculate(criteria, j)["score"] == "30.00"
    for c in criteria:
        c["weight"] = 0
    assert calculate(criteria, j)["score"] is None
    for c in criteria:
        c["weight"] = 10
    for item in j:
        item.update(status="na", raw_score=None)
    assert calculate(criteria, j)["score"] is None


def test_no_intermediate_rounding():
    criteria = [dict(id="X", section="S", kind="discrete_scale", weight=1, max_score=3)]
    result = calculate(
        criteria, [dict(criterion_id="X", status="scored", raw_score=1, answer="1")]
    )
    assert result["score"] == "33.33"
