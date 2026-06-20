"""SQLAlchemy ORM (Postgres + pgvector). Kept separate from the trust path: the
confidence engine never sees these rows — store_pg.py maps them to DepositRecord."""
from __future__ import annotations

import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

EMBED_DIM = 384


class Base(DeclarativeBase):
    pass


class Deposit(Base):
    __tablename__ = "deposits"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    query_text: Mapped[str] = mapped_column(Text, nullable=False)
    query_embedding: Mapped[list[float]] = mapped_column(Vector(EMBED_DIM), nullable=False)
    claim: Mapped[str] = mapped_column(Text, nullable=False)
    sources: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    scope: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    volatility: Mapped[str] = mapped_column(String(16), nullable=False)
    depositor: Mapped[str] = mapped_column(String(256), nullable=False)
    base_confidence: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_corroborated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    corroboration_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    disagreement_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    retired: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    superseded_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)


class QueryEvent(Base):
    __tablename__ = "query_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    query_text: Mapped[str] = mapped_column(Text, nullable=False)
    outcome: Mapped[str] = mapped_column(String(8), nullable=False)  # hit|miss|stale
    matched_deposit_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    similarity: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence_at_serve: Mapped[float | None] = mapped_column(Float, nullable=True)
    tokens_saved_estimate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tokens_spent_estimate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    volatility: Mapped[str | None] = mapped_column(String(16), nullable=True)


class Corroboration(Base):
    __tablename__ = "corroborations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deposit_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    agreed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    fresh_claim_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
