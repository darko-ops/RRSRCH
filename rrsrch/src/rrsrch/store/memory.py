"""In-memory store: vector kNN (numpy cosine) ∪ lexical kNN (trigram). Used by the
eval and tests so the matching engine runs with no external services."""
from __future__ import annotations

from typing import Any
from uuid import UUID

import numpy as np

from ..embeddings import cosine
from ..matching.lexical import lexical_score
from ..schemas import DepositRecord


class InMemoryStore:
    def __init__(self) -> None:
        self._d: dict[UUID, DepositRecord] = {}
        self._events: list[dict[str, Any]] = []

    async def add(self, rec: DepositRecord) -> UUID:
        self._d[rec.id] = rec
        return rec.id

    async def get(self, deposit_id: UUID) -> DepositRecord | None:
        return self._d.get(deposit_id)

    async def candidate_pool(
        self, query_embedding: np.ndarray, query_text: str, k: int
    ) -> list[DepositRecord]:
        recs = list(self._d.values())
        if not recs:
            return []
        by_vec = sorted(recs, key=lambda r: cosine(query_embedding, r.embedding), reverse=True)[:k]
        by_lex = sorted(recs, key=lambda r: lexical_score(query_text, r.query), reverse=True)[:k]
        seen: dict[UUID, DepositRecord] = {}
        for r in [*by_vec, *by_lex]:
            seen.setdefault(r.id, r)
        return list(seen.values())

    async def log_event(self, event: dict[str, Any]) -> None:
        self._events.append(event)

    async def events(self) -> list[dict[str, Any]]:
        return list(self._events)
