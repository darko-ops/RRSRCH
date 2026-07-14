"""SQLAlchemy ORM (Postgres + pgvector). Kept out of the matching/confidence path;
PostgresStore maps rows to the ORM-free DepositRecord."""
from __future__ import annotations

import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Float, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

EMBED_DIM = 384


class Base(DeclarativeBase):
    pass


class Deposit(Base):
    __tablename__ = "deposits"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    query: Mapped[str] = mapped_column(Text, nullable=False)
    query_embedding: Mapped[list[float]] = mapped_column(Vector(EMBED_DIM), nullable=False)
    claim: Mapped[str] = mapped_column(Text, nullable=False)
    sources: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    scope: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    volatility: Mapped[str] = mapped_column(String(16), nullable=False)
    depositor: Mapped[str] = mapped_column(String(256), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # corroboration lifecycle (confidence anchor + retirement chain)
    last_corroborated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True)
    corroboration_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0,
                                                     server_default="0")
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    superseded_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    topic_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # implicit scope inferred from the query prose (Phase 2); NULL ⇒ infer on read
    inferred_scope: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    independent_corroboration_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0")
    attestation: Mapped[str | None] = mapped_column(Text, nullable=True)
    # measured cost of producing the claim (reported by the depositor); NULL ⇒
    # savings for hits on this deposit stay estimate-based
    derivation_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)


class DepositorTrust(Base):
    """Per-depositor track record. `score` is derived (counts are the source of
    truth) and persisted only for observability; trust math lives in
    confidence.py — pure code, never an LLM."""
    __tablename__ = "depositor_trust"

    depositor: Mapped[str] = mapped_column(String(256), primary_key=True)
    agreed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0,
                                              server_default="0")
    contradicted_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0,
                                                    server_default="0")
    score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0,
                                         server_default="0")
    # highest VERIFIED attestation level presented by this depositor (Phase 3);
    # NULL ⇒ unattested ⇒ exactly the Phase 2 trust math.
    attested_level: Mapped[float | None] = mapped_column(Float, nullable=True)


class Topic(Base):
    """Per-topic bandit state. Mutated only via exploration.py's pure functions."""
    __tablename__ = "topic_state"

    topic_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    scope_key: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    centroid: Mapped[list[float]] = mapped_column(Vector(EMBED_DIM), nullable=False)
    base_volatility: Mapped[str] = mapped_column(String(16), nullable=False)
    exploration_rate: Mapped[float] = mapped_column(Float, nullable=False)
    agreement_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0,
                                                 server_default="0")
    disagreement_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0,
                                                    server_default="0")
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True),
                                                              nullable=True)
    observed_volatility: Mapped[str | None] = mapped_column(String(16), nullable=True)
    half_life_factor: Mapped[float] = mapped_column(Float, nullable=False, default=1.0,
                                                    server_default="1.0")
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class QueryEvent(Base):
    __tablename__ = "query_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    query: Mapped[str] = mapped_column(Text, nullable=False)
    outcome: Mapped[str] = mapped_column(String(16), nullable=False)  # hit|stale|miss|agreed|disagreed
    reason: Mapped[str | None] = mapped_column(String(40), nullable=True)
    similarity: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    tokens_saved_estimate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tokens_spent_estimate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    served_deposit_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    volatility: Mapped[str | None] = mapped_column(String(16), nullable=True)
    topic_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    detail: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # audit trail
