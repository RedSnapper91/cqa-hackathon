from dataclasses import dataclass
from pathlib import Path
import os
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")


@dataclass
class Settings:
    database_url: str = os.getenv("DATABASE_URL", f"sqlite:///{ROOT / 'cqa.db'}")
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    provider: str = os.getenv("LLM_PROVIDER", "gemini")
    model: str = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
    organizer_url: str = os.getenv("ORGANIZER_DEV_API_URL", "")
    parallel: int = max(1, min(8, int(os.getenv("MAX_PARALLEL_EVALUATIONS", "3"))))
    timeout: float = float(os.getenv("EVALUATION_TIMEOUT_SECONDS", "90"))
    allow_calls: bool = (
        os.getenv("ALLOW_EXTERNAL_LLM_FOR_REAL_CALLS", "false").lower() == "true"
    )
    input_rate: str = os.getenv("MODEL_INPUT_USD_PER_MILLION", "")
    output_rate: str = os.getenv("MODEL_OUTPUT_USD_PER_MILLION", "")
    testing: bool = False

    def __post_init__(self):
        from decimal import Decimal, InvalidOperation

        if self.provider != "gemini":
            raise ValueError(
                "LLM_PROVIDER must be gemini; additional providers require an adapter"
            )
        for value in (self.input_rate, self.output_rate):
            if value:
                try:
                    rate = Decimal(value)
                    if not rate.is_finite() or rate < 0:
                        raise InvalidOperation
                except InvalidOperation:
                    raise ValueError(
                        "Model prices must be finite, nonnegative decimal USD rates"
                    ) from None
        if self.timeout <= 0:
            raise ValueError("EVALUATION_TIMEOUT_SECONDS must be positive")
