"""SQLAlchemy ORM (Postgres + pgvector). Kept out of the matching/freshness path;
PostgresStore maps rows to the ORM-free DepositRecord."""
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
    query: Mapped[str] = mapped_column(Text, nullable=False)
    query_embedding: Mapped[list[float]] = mapped_column(Vector(EMBED_DIM), nullable=False)
    claim: Mapped[str] = mapped_column(Text, nullable=False)
    sources: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    scope: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    volatility: Mapped[str] = mapped_column(String(16), nullable=False)
    depositor: Mapped[str] = mapped_column(String(256), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class QueryEvent(Base):
    __tablename__ = "query_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    query: Mapped[str] = mapped_column(Text, nullable=False)
    outcome: Mapped[str] = mapped_column(String(8), nullable=False)   # hit|miss
    reason: Mapped[str | None] = mapped_column(String(40), nullable=True)
    similarity: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    tokens_saved_estimate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tokens_spent_estimate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    served_deposit_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    volatility: Mapped[str | None] = mapped_column(String(16), nullable=True)
