"""Postgres + pgvector store. candidate_pool = vector kNN (pgvector cosine) ∪
lexical kNN (pg_trgm similarity on the query column) — the hybrid retrieval the
engine then scope-gates, fuses, and thresholds. Satisfies the same Store contract
as InMemoryStore, so engine/corpus logic is identical. (Runs on the deployed box.)"""
from __future__ import annotations

from typing import Any
from uuid import UUID

import numpy as np
from sqlalchemy import func, select

from ..config import Settings
from ..schemas import DepositRecord
from .db import get_sessionmaker
from .models import Deposit, QueryEvent


def _to_record(r: Deposit) -> DepositRecord:
    return DepositRecord(
        id=r.id, query=r.query, embedding=np.asarray(r.query_embedding, dtype=np.float32),
        claim=r.claim, sources=r.sources, scope=r.scope, volatility=r.volatility,
        depositor=r.depositor, created_at=r.created_at,
    )


class PostgresStore:
    def __init__(self, settings: Settings) -> None:
        self._sm = get_sessionmaker(settings)

    async def add(self, rec: DepositRecord) -> UUID:
        async with self._sm() as s:
            s.add(Deposit(
                id=rec.id, query=rec.query, query_embedding=list(map(float, rec.embedding)),
                claim=rec.claim, sources=rec.sources, scope=rec.scope, volatility=rec.volatility,
                depositor=rec.depositor, created_at=rec.created_at,
            ))
            await s.commit()
        return rec.id

    async def get(self, deposit_id: UUID) -> DepositRecord | None:
        async with self._sm() as s:
            row = await s.get(Deposit, deposit_id)
            return _to_record(row) if row else None

    async def candidate_pool(
        self, query_embedding: np.ndarray, query_text: str, k: int
    ) -> list[DepositRecord]:
        vec = list(map(float, query_embedding))
        async with self._sm() as s:
            by_vec = (await s.execute(
                select(Deposit).order_by(Deposit.query_embedding.cosine_distance(vec)).limit(k)
            )).scalars().all()
            # pg_trgm lexical retrieval over the query text.
            by_lex = (await s.execute(
                select(Deposit).order_by(func.similarity(Deposit.query, query_text).desc()).limit(k)
            )).scalars().all()
        seen: dict[UUID, DepositRecord] = {}
        for r in [*by_vec, *by_lex]:
            seen.setdefault(r.id, _to_record(r))
        return list(seen.values())

    async def log_event(self, event: dict[str, Any]) -> None:
        async with self._sm() as s:
            s.add(QueryEvent(
                query=event["query"], outcome=event["outcome"], reason=event.get("reason"),
                similarity=event.get("similarity"), confidence=event.get("confidence"),
                tokens_saved_estimate=event.get("tokens_saved_estimate"),
                tokens_spent_estimate=event.get("tokens_spent_estimate"),
                served_deposit_id=event.get("served_deposit_id"), volatility=event.get("volatility"),
            ))
            await s.commit()

    async def events(self) -> list[dict[str, Any]]:
        async with self._sm() as s:
            rows = (await s.execute(select(QueryEvent))).scalars().all()
            return [{
                "outcome": r.outcome, "reason": r.reason,
                "tokens_saved_estimate": r.tokens_saved_estimate,
                "tokens_spent_estimate": r.tokens_spent_estimate, "volatility": r.volatility,
            } for r in rows]
