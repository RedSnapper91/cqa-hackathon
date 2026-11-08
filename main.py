"""Compatibility entrypoint: uvicorn main:app starts the complete shared backend."""

from backend.app.main import app

__all__ = ["app"]
