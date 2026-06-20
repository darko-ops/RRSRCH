"""Postgres+pgvector implementation of CorpusStore. Maps ORM rows <-> DepositRecord
so the corpus logic and trust engine stay ORM-free. Vector search uses pgvector's
cosine distance operator. (Runs on the deployed box; the in-memory store covers the
same contract for offline tests.)"""
from __future__ import annotations

from typing import Any
from uuid import UUID

import numpy as np
from sqlalchemy import select, update

from .config import Settings
from .db import get_sessionmaker
from .models import Corroboration, Deposit, QueryEvent
from .schemas import DepositRecord


def _to_record(row: Deposit) -> DepositRecord:
    return DepositRecord(
        id=row.id, query_text=row.query_text, embedding=np.asarray(row.query_embedding, dtype=np.float32),
        claim=row.claim, sources=row.sources, scope=row.scope, volatility=row.volatility,
        depositor=row.depositor, base_confidence=row.base_confidence, created_at=row.created_at,
        last_corroborated_at=row.last_corroborated_at, corroboration_count=row.corroboration_count,
        disagreement_count=row.disagreement_count, retired=row.retired, superseded_by=row.superseded_by,
    )


class PostgresCorpusStore:
    def __init__(self, settings: Settings) -> None:
        self._sm = get_sessionmaker(settings)

    async def add_deposit(self, rec: DepositRecord) -> UUID:
        async with self._sm() as s:
            s.add(Deposit(
                id=rec.id, query_text=rec.query_text, query_embedding=list(map(float, rec.embedding)),
                claim=rec.claim, sources=rec.sources, scope=rec.scope, volatility=rec.volatility,
                depositor=rec.depositor, base_confidence=rec.base_confidence, created_at=rec.created_at,
            ))
            await s.commit()
        return rec.id

    async def get_deposit(self, deposit_id: UUID) -> DepositRecord | None:
        async with self._sm() as s:
            row = await s.get(Deposit, deposit_id)
            return _to_record(row) if row else None

    async def update_deposit(self, rec: DepositRecord) -> None:
        async with self._sm() as s:
            await s.execute(update(Deposit).where(Deposit.id == rec.id).values(
                last_corroborated_at=rec.last_corroborated_at, corroboration_count=rec.corroboration_count,
                disagreement_count=rec.disagreement_count, retired=rec.retired, superseded_by=rec.superseded_by,
            ))
            await s.commit()

    async def vector_search(
        self, embedding: np.ndarray, k: int, include_retired: bool = False
    ) -> list[tuple[DepositRecord, float]]:
        vec = list(map(float, embedding))
        async with self._sm() as s:
            dist = Deposit.query_embedding.cosine_distance(vec)
            stmt = select(Deposit, dist.label("dist"))
            if not include_retired:
                stmt = stmt.where(Deposit.retired.is_(False))
            stmt = stmt.order_by(dist).limit(k)
            rows = (await s.execute(stmt)).all()
        # cosine similarity = 1 - cosine distance
        return [(_to_record(r[0]), 1.0 - float(r[1])) for r in rows]

    async def add_query_event(self, event: dict[str, Any]) -> None:
        async with self._sm() as s:
            s.add(QueryEvent(**event))
            await s.commit()

    async def add_corroboration(self, row: dict[str, Any]) -> None:
        async with self._sm() as s:
            s.add(Corroboration(deposit_id=row["deposit_id"], agreed=row["agreed"],
                                note=row.get("note")))
            await s.commit()

    async def query_events(self) -> list[dict[str, Any]]:
        async with self._sm() as s:
            rows = (await s.execute(select(QueryEvent))).scalars().all()
            return [{
                "outcome": r.outcome, "tokens_saved_estimate": r.tokens_saved_estimate,
                "tokens_spent_estimate": r.tokens_spent_estimate, "volatility": r.volatility,
            } for r in rows]
