from ..schemas import EvaluationDraft


def validate_draft(draft, conversation, checklist):
    draft = EvaluationDraft.model_validate(draft)
    if (
        draft.conversation_id != conversation["external_id"]
        or draft.checklist_version_id != checklist["id"]
        or draft.language != conversation["language"]
    ):
        raise ValueError(
            "Evaluation metadata does not match the trusted conversation/checklist"
        )
    criteria = {c["id"]: c for c in checklist["criteria"] if c.get("active", True)}
    ids = [j.criterion_id for j in draft.criteria]
    if len(set(ids)) != len(ids) or set(ids) != set(criteria):
        raise ValueError("Exactly one judgment per active criterion is required")
    messages = {m["id"]: m for m in conversation["messages"]}
    for j in draft.criteria:
        c = criteria[j.criterion_id]
        if len(set(j.evidence_message_ids)) != len(j.evidence_message_ids):
            raise ValueError(f"{c['id']}: duplicate evidence")
        if any(mid not in messages for mid in j.evidence_message_ids):
            raise ValueError(f"{c['id']}: evidence must reference existing message IDs")
        if j.checked_span:
            start, end = j.checked_span.start_message_id, j.checked_span.end_message_id
            if (
                start not in messages
                or end not in messages
                or messages[start]["ordinal"] > messages[end]["ordinal"]
            ):
                raise ValueError(f"{c['id']}: checked span IDs/order are invalid")
        if j.omission and j.checked_span is None:
            raise ValueError(f"{c['id']}: omissions require a checked span")
        for quote in j.quotes:
            if quote.message_id not in j.evidence_message_ids or " ".join(
                quote.quote.split()
            ) not in " ".join(messages[quote.message_id]["text"].split()):
                raise ValueError(
                    f"{c['id']}: quote must exactly match its cited original message"
                )
        if j.status == "na":
            if (
                not c["na_allowed"]
                or j.answer != "N/A"
                or j.raw_score is not None
                or not j.na_reason
                or not j.na_reason.strip()
            ):
                raise ValueError(f"{c['id']}: N/A is not permitted or justified")
        elif c["kind"] == "flag":
            if j.raw_score is not None or j.answer not in (
                c["yes_label"],
                c["no_label"],
            ):
                raise ValueError(
                    f"{c['id']}: flag must have a yes/no answer and no numeric score"
                )
        else:
            if j.raw_score is None or j.raw_score not in c["allowed_scores"]:
                raise ValueError(
                    f"{c['id']}: score is outside the configured discrete scale"
                )
            if c["kind"] == "binary":
                if j.answer != (c["yes_label"] if j.raw_score == 1 else c["no_label"]):
                    raise ValueError(f"{c['id']}: answer and binary score disagree")
                if j.raw_score == 0 and j.checked_span is None:
                    raise ValueError(
                        f"{c['id']}: negative binary judgment requires checked span"
                    )
            elif j.answer != f"{j.raw_score:g}":
                raise ValueError(f"{c['id']}: numeric answer must match its score")
        if j.fact_verification_needed:
            j.review_required = True
    return draft
