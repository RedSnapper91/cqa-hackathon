"""Connection baseline only. No model is connected and no assessment is fabricated."""
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field


app = FastAPI(title="CQA API Baseline", version="0.1.0",
              description="Accepts conversations. AI evaluation is not connected yet.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000",
                   "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"], allow_headers=["Content-Type"],
)


class Message(BaseModel):
    timestamp: str
    speaker: Literal["operator", "client", "bot", "system"]
    text: str = Field(min_length=1)


class Criterion(BaseModel):
    id: str = Field(min_length=1)
    instruction: str = Field(min_length=1)
    weight: float = Field(ge=0, allow_inf_nan=False)


class EvaluationRequest(BaseModel):
    conversation_id: str = Field(min_length=1)
    language: Literal["RU", "KZ", "EN"]
    transcript: list[Message] = Field(min_length=1)
    checklist: list[Criterion] = Field(min_length=1)


@app.get("/", include_in_schema=False)
async def home():
    return RedirectResponse("/docs")


@app.get("/health")
async def health():
    return {"status": "ok", "ai_connected": False}


@app.post("/evaluate", responses={503: {"description": "AI not connected yet"}})
async def evaluate(request: EvaluationRequest):
    """Validate the request, then explicitly report that the evaluator is missing."""
    raise HTTPException(status_code=503, detail={
        "status": "ai_not_connected",
        "message": "Request validated, but no AI evaluation has been performed.",
        "conversation_id": request.conversation_id,
        "received_messages": len(request.transcript),
        "received_criteria": len(request.checklist),
        "score": None,
    })
