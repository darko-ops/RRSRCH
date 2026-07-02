"""Deposit schema (the quality bar) + the internal record + tool responses."""
from __future__ import annotations

from dataclasses import dataclass
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
    outcome: str                       # 'hit' | 'stale' | 'miss'
    reason: str | None = None          # e.g. 'confidence_below_threshold', 'no_match'
    claim: str | None = None
    confidence: float | None = None    # live decayed confidence
    similarity: float | None = None
    age_seconds: float | None = None
    sources: list[Source] | None = None
    scope: dict[str, Any] | None = None
    depositor: str | None = None
    deposit_id: str | None = None


class CorroborateResult(BaseModel):
    outcome: str                       # 'agreed' | 'disagreed' | 'not_found' | 'retired'
    deposit_id: str | None = None      # the deposit corroborated (or looked up)
    new_deposit_id: str | None = None  # on 'disagreed': the replacement
    superseded_by: str | None = None   # on 'retired': where the live claim now lives
    confidence: float | None = None    # on 'agreed': re-earned confidence (1.0)
    claim_similarity: float | None = None  # lexical score (audit input, not the verdict)
    rule: str | None = None            # which deterministic rule decided (audit)


class RecallItem(BaseModel):
    """One entry in the correction-propagation feed: an answer that died."""
    retired_deposit_id: str
    superseded_by: str | None = None
    topic_id: str | None = None
    retired_at: datetime


class ResearchResult(BaseModel):
    """What a SearchProvider returns from a fresh derivation."""
    claim: str
    sources: list[Source] = Field(default_factory=list)
    tokens_spent: int = 0


@dataclass
class DepositRecord:
    """Internal currency between store, matching, and confidence (ORM-free)."""
    id: UUID
    query: str
    embedding: np.ndarray
    claim: str
    sources: list[dict[str, Any]]
    scope: dict[str, Any] | None
    volatility: str
    depositor: str
    created_at: datetime
    last_corroborated_at: datetime | None = None
    corroboration_count: int = 0
    retired_at: datetime | None = None
    superseded_by: UUID | None = None
    topic_id: str | None = None

    @staticmethod
    def new(**kw: Any) -> "DepositRecord":
        kw.setdefault("id", uuid4())
        kw.setdefault("created_at", datetime.now(timezone.utc))
        return DepositRecord(**kw)


@dataclass
class TopicState:
    """Per-topic bandit state (ORM-free). All mutations happen through the pure
    functions in exploration.py — deterministic code, never an LLM."""
    topic_id: str
    scope_key: str
    centroid: np.ndarray          # the leader deposit's embedding (stable, no drift)
    base_volatility: str          # the seeding hint
    exploration_rate: float
    agreement_count: int = 0
    disagreement_count: int = 0
    last_verified_at: datetime | None = None   # None ⇒ max verification priority
    observed_volatility: str | None = None     # overrides the hint once evidence suffices
    half_life_factor: float = 1.0
    created_at: datetime | None = None
