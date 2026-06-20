"""Deposit schema (the quality bar) + the internal record + tool responses."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

import numpy as np
from pydantic import BaseModel, Field, field_validator

Volatility = str  # 'low' | 'medium' | 'high'
_VALID_VOL = {"low", "medium", "high"}


class Source(BaseModel):
    url: str
    retrieved_at: datetime | None = None
    title: str | None = None


class DepositIn(BaseModel):
    query: str = Field(min_length=1)
    claim: str = Field(min_length=1)
    sources: list[Source] = Field(default_factory=list)
    volatility_hint: Volatility = "medium"
    scope: dict[str, Any] | None = None
    depositor: str = "local"

    @field_validator("volatility_hint")
    @classmethod
    def _vol(cls, v: str) -> str:
        if v not in _VALID_VOL:
            raise ValueError(f"volatility_hint must be one of {sorted(_VALID_VOL)}")
        return v


class SearchResult(BaseModel):
    serve: bool
    outcome: str                       # 'hit' | 'miss'
    reason: str | None = None          # e.g. 'stale_below_threshold', 'no_match', 'scope_mismatch'
    claim: str | None = None
    confidence: float | None = None    # freshness
    similarity: float | None = None
    age_seconds: float | None = None
    sources: list[Source] | None = None
    scope: dict[str, Any] | None = None
    depositor: str | None = None
    deposit_id: str | None = None


@dataclass
class DepositRecord:
    """Internal currency between store, matching, and freshness (ORM-free)."""
    id: UUID
    query: str
    embedding: np.ndarray
    claim: str
    sources: list[dict[str, Any]]
    scope: dict[str, Any] | None
    volatility: str
    depositor: str
    created_at: datetime

    @staticmethod
    def new(**kw: Any) -> "DepositRecord":
        kw.setdefault("id", uuid4())
        kw.setdefault("created_at", datetime.now(timezone.utc))
        return DepositRecord(**kw)
