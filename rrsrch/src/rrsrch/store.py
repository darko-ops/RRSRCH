"""Corpus storage behind an async interface.

`CorpusStore` is the contract corpus.py depends on. Two implementations:
  - InMemoryCorpusStore (here): numpy cosine search, no external services — used by
    tests and the offline demo.
  - PostgresCorpusStore (store_pg.py): SQLAlchemy async + pgvector — the deployable path.

Both speak `DepositRecord`, never the ORM row, so the logic above them is identical."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol
from uuid import UUID, uuid4

import numpy as np

from .embedder import cosine
from .schemas import DepositRecord


class CorpusStore(Protocol):
    async def add_deposit(self, rec: DepositRecord) -> UUID: ...
    async def get_deposit(self, deposit_id: UUID) -> DepositRecord | None: ...
    async def update_deposit(self, rec: DepositRecord) -> None: ...
    async def vector_search(
        self, embedding: np.ndarray, k: int, include_retired: bool = False
    ) -> list[tuple[DepositRecord, float]]: ...
    async def add_query_event(self, event: dict[str, Any]) -> None: ...
    async def add_corroboration(self, row: dict[str, Any]) -> None: ...
    async def query_events(self) -> list[dict[str, Any]]: ...


class InMemoryCorpusStore:
    def __init__(self) -> None:
        self._deposits: dict[UUID, DepositRecord] = {}
        self._events: list[dict[str, Any]] = []
        self._corroborations: list[dict[str, Any]] = []

    async def add_deposit(self, rec: DepositRecord) -> UUID:
        if rec.id is None:  # type: ignore[unreachable]
            rec.id = uuid4()
        self._deposits[rec.id] = rec
        return rec.id

    async def get_deposit(self, deposit_id: UUID) -> DepositRecord | None:
        return self._deposits.get(deposit_id)

    async def update_deposit(self, rec: DepositRecord) -> None:
        self._deposits[rec.id] = rec

    async def vector_search(
        self, embedding: np.ndarray, k: int, include_retired: bool = False
    ) -> list[tuple[DepositRecord, float]]:
        scored: list[tuple[DepositRecord, float]] = []
        for rec in self._deposits.values():
            if rec.retired and not include_retired:
                continue
            scored.append((rec, cosine(embedding, rec.embedding)))
        scored.sort(key=lambda t: t[1], reverse=True)
        return scored[:k]

    async def add_query_event(self, event: dict[str, Any]) -> None:
        self._events.append(event)

    async def add_corroboration(self, row: dict[str, Any]) -> None:
        self._corroborations.append(row)

    async def query_events(self) -> list[dict[str, Any]]:
        return list(self._events)
