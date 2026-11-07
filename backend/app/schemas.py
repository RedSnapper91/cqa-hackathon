from typing import Literal
from datetime import datetime
import re
from urllib.parse import urlsplit
from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


Text = str


class Criterion(StrictModel):
    id: str = Field(pattern=r"^[A-Za-z][A-Za-z0-9_-]{0,39}$")
    section: str = Field(min_length=1, max_length=160)
    title: str = Field(min_length=1, max_length=240)
    description: str = Field(min_length=1, max_length=12000)
    kind: Literal["binary", "discrete_scale", "flag"]
    weight: float = Field(ge=0, le=10000, allow_inf_nan=False)
    allowed_scores: list[float] = Field(
        default_factory=lambda: [0, 1], min_length=1, max_length=50
    )
    max_score: float = Field(default=1, gt=0, allow_inf_nan=False)
    yes_label: str = Field(default="Да", min_length=1, max_length=100)
    no_label: str = Field(default="Нет", min_length=1, max_length=100)
    rubric: dict[str, str] = Field(default_factory=dict)
    na_allowed: bool = False
    na_rule: str = Field(default="", max_length=4000)
    evidence_required: bool = True
    is_gross_violation_flag: bool = False
    active: bool = True

    @model_validator(mode="after")
    def valid_scale(self):
        import math

        if any(not math.isfinite(s) or s < 0 for s in self.allowed_scores):
            raise ValueError("Scores must be finite and nonnegative")
        if len(set(self.allowed_scores)) != len(self.allowed_scores):
            raise ValueError("Scores must be unique")
        if self.yes_label == self.no_label:
            raise ValueError("Yes and No labels must be distinct")
        if self.kind == "discrete_scale" and max(self.allowed_scores) != self.max_score:
            raise ValueError("Maximum allowed score must equal max_score")
        if self.kind in ("binary", "flag") and (
            self.allowed_scores != [0, 1] or self.max_score != 1
        ):
            raise ValueError("Binary and flag scales must be [0, 1], maximum 1")
        if self.kind == "flag" and (self.weight != 0 or self.na_allowed):
            raise ValueError("Flags have zero weight and cannot be N/A")
        if self.is_gross_violation_flag and self.kind != "flag":
            raise ValueError("Gross violation indicator must be a flag")
        if self.na_allowed and not self.na_rule.strip():
            raise ValueError("An exact N/A applicability rule is required")
        return self


class ChecklistCreate(StrictModel):
    name: str = Field(min_length=1, max_length=160)
    parent_id: str | None = None
    criteria: list[Criterion] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def unique_ids(self):
        ids = [c.id for c in self.criteria]
        if len(set(ids)) != len(ids) or not any(c.active for c in self.criteria):
            raise ValueError(
                "Criterion IDs must be unique; at least one active criterion is required"
            )
        return self


class MessageInput(StrictModel):
    timestamp: str = Field(min_length=1, max_length=80)
    speaker: Literal["client", "operator", "bot", "system"]
    text: str = Field(min_length=1, max_length=100000)
    # Transcript text and raw timestamps are retained verbatim.
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)


class ConversationInput(BaseModel):
    model_config = ConfigDict(extra="allow")
    conversation_id: str = Field(min_length=1, max_length=200)
    channel: Literal["agent chat", "voice call"]
    language: Literal["RU", "KZ", "EN"]
    transcript: list[MessageInput] = Field(min_length=1, max_length=10000)
    audio_url: str | None

    @model_validator(mode="after")
    def timestamps_and_url(self):
        for message in self.transcript:
            if self.channel == "agent chat":
                if not re.fullmatch(r"\d{2,}:[0-5]\d", message.timestamp):
                    raise ValueError("Chat timestamps must be MM:SS")
            else:
                try:
                    stamp = datetime.fromisoformat(
                        message.timestamp.replace("Z", "+00:00")
                    )
                    if stamp.tzinfo is None:
                        raise ValueError()
                except ValueError:
                    raise ValueError(
                        "Call timestamps must be ISO 8601 with timezone"
                    ) from None
        if self.audio_url:
            parts = urlsplit(self.audio_url)
            if (
                parts.scheme not in ("http", "https")
                or not parts.hostname
                or parts.username
                or parts.password
            ):
                raise ValueError(
                    "Recording must be an HTTP(S) URL without embedded credentials"
                )
        if self.channel == "agent chat" and self.audio_url is not None:
            raise ValueError("Chat audio_url must be null")
        return self


class DatasetData(StrictModel):
    dataset_group_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")
    total_records: int = Field(ge=0, le=10000)
    records: list[ConversationInput] = Field(max_length=10000)

    @model_validator(mode="after")
    def record_count(self):
        if self.total_records != len(self.records):
            raise ValueError("total_records does not match records length")
        ids = [r.conversation_id for r in self.records]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate conversation IDs within dataset")
        return self


class DatasetPayload(StrictModel):
    error: str
    isSuccess: bool
    data: DatasetData

    @model_validator(mode="after")
    def success(self):
        if not self.isSuccess:
            raise ValueError("Organizer reported unsuccessful import")
        return self


class GroupRequest(StrictModel):
    group_id: str = Field(default="DEV", pattern=r"^[A-Za-z0-9_-]{1,64}$")


class CheckedSpan(StrictModel):
    start_message_id: str
    end_message_id: str


class EvidenceQuote(StrictModel):
    message_id: str
    quote: str = Field(min_length=1)


class Judgment(StrictModel):
    criterion_id: str
    status: Literal["scored", "na"]
    answer: str
    raw_score: float | None = Field(allow_inf_nan=False, strict=True)
    reason: str = Field(min_length=1, max_length=6000)
    na_reason: str | None = None
    evidence_message_ids: list[str] = Field(min_length=1)
    checked_span: CheckedSpan | None = None
    omission: bool = False
    quotes: list[EvidenceQuote] = Field(default_factory=list)
    review_required: bool = False
    fact_verification_needed: bool = False


class EvaluationDraft(StrictModel):
    conversation_id: str
    checklist_version_id: str
    language: Literal["RU", "KZ", "EN"]
    criteria: list[Judgment]
    provider_warnings: list[str] = Field(default_factory=list)


class EvaluateRequest(StrictModel):
    conversation_id: str
    checklist_version_id: str


class ChecklistSelection(StrictModel):
    checklist_version_id: str


class BatchRequest(StrictModel):
    conversation_ids: list[str] | None = Field(
        default=None, min_length=1, max_length=10000
    )
    group_id: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{1,64}$")
    checklist_version_id: str

    @model_validator(mode="after")
    def target(self):
        if bool(self.conversation_ids) == bool(self.group_id):
            raise ValueError("Specify conversation_ids or group_id, exclusively")
        return self


class AppealCreate(StrictModel):
    run_id: str
    criterion_id: str
    comment: str = Field(min_length=1, max_length=4000)
    actor: str = Field(default="Quality supervisor", min_length=1, max_length=100)


class DecisionCreate(StrictModel):
    action: Literal["confirm", "change"]
    reason: str = Field(min_length=1, max_length=4000)
    reviewer: str = Field(default="Demo reviewer", min_length=1, max_length=100)
    judgment: Judgment | None = None

    @model_validator(mode="after")
    def require_change(self):
        if self.action == "change" and self.judgment is None:
            raise ValueError("Changed judgment is required")
        return self
