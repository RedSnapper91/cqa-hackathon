"""Pure deterministic scoring; HALF_UP ties, no intermediate point rounding."""

from decimal import Decimal, ROUND_HALF_UP, localcontext


def calculate(criteria, judgments):
    by_id = {j["criterion_id"]: j for j in judgments}
    earned = Decimal(0)
    denominator = Decimal(0)
    sections = {}
    result = []
    gross = False
    with localcontext() as context:
        context.prec = 50
        for c in criteria:
            if not c.get("active", True):
                continue
            j = by_id[c["id"]]
            section = sections.setdefault(
                c["section"],
                {
                    "earned": Decimal(0),
                    "denominator": Decimal(0),
                    "flag_only": True,
                    "flagged": False,
                },
            )
            weight = Decimal(str(c["weight"]))
            contribution = None
            if c["kind"] == "flag":
                flagged = j["answer"] == c["yes_label"]
                section["flagged"] |= flagged
                if c.get("is_gross_violation_flag"):
                    gross |= flagged
            else:
                section["flag_only"] = False
                if j["status"] != "na":
                    contribution = (
                        weight
                        * Decimal(str(j["raw_score"]))
                        / Decimal(str(c["max_score"]))
                    )
                    earned += contribution
                    denominator += weight
                    section["earned"] += contribution
                    section["denominator"] += weight
            result.append(
                {
                    **j,
                    "weight": str(weight),
                    "contribution": str(contribution)
                    if contribution is not None
                    else None,
                }
            )

        def score(e, d):
            return (
                str((100 * e / d).quantize(Decimal(".01"), rounding=ROUND_HALF_UP))
                if d
                else None
            )

        return {
            "score": score(earned, denominator),
            "earned": str(earned),
            "denominator": str(denominator),
            "gross_violation": gross,
            "criteria": result,
            "sections": {
                name: {
                    "score": score(s["earned"], s["denominator"])
                    if not s["flag_only"]
                    else None,
                    "earned": str(s["earned"]),
                    "denominator": str(s["denominator"]),
                    "flag_only": s["flag_only"],
                    "flagged": s["flagged"],
                }
                for name, s in sections.items()
            },
        }
