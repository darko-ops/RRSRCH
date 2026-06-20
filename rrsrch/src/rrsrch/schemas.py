"""Pydantic request/response schemas + the ORM-free domain record the store and
the confidence engine operate on."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID

import numpy as np
from pydantic import BaseModel, Field

from . import confidence

Volatility = str  # 'low' | 'medium' | 'high'


class Source(BaseModel):
    url: str
    retrieved_at: datetime | None = None
    title: str | None = None


class DepositIn(BaseModel):
    query: str = Field(min_length=1)
    claim: str = Field(min_length=1)
    sources: list[Source] = Field(default_factory=list)
    volatility_hint: Volatility = "medium"
    scope: dict[str, Any] = Field(default_factory=dict)
    depositor: str = "local"


class SearchOut(BaseModel):
    outcome: str                       # 'hit' | 'miss' | 'stale'
    advice: str                        # what the agent should do
    claim: str | None = None
    confidence: float | None = None
    similarity: float | None = None
    deposited_age_seconds: float | None = None
    provenance: str | None = None
    sources: list[Source] | None = None
    deposit_id: str | None = None


@dataclass
class DepositRecord:
    """Internal currency between corpus, store, and the confidence engine. Not an
    ORM row (so the trust path never depends on SQLAlchemy)."""
    id: UUID
    query_text: str
    embedding: np.ndarray
    claim: str
    sources: list[dict[str, Any]]
    scope: dict[str, Any]
    volatility: str
    depositor: str
    base_confidence: float
    created_at: datetime
    last_corroborated_at: datetime | None = None
    corroboration_count: int = 0
    disagreement_count: int = 0
    retired: bool = False
    superseded_by: UUID | None = None

    def to_state(self) -> confidence.DepositState:
        return confidence.DepositState(
            base_confidence=self.base_confidence,
            created_at=self.created_at,
            volatility=self.volatility,
            corroboration_count=self.corroboration_count,
            disagreement_count=self.disagreement_count,
            last_corroborated_at=self.last_corroborated_at,
        )
