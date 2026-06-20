"""Store interface. `candidate_pool` returns the UNION of lexical and vector
nearest neighbors (no scope filtering, no threshold) — the engine applies the
scope gate, fuses scores, and thresholds. Keeping retrieval here and ranking in
the engine makes the in-memory and Postgres stores interchangeable."""
from __future__ import annotations

from typing import Any, Protocol
from uuid import UUID

import numpy as np

from ..schemas import DepositRecord


class Store(Protocol):
    async def add(self, rec: DepositRecord) -> UUID: ...
    async def get(self, deposit_id: UUID) -> DepositRecord | None: ...
    async def candidate_pool(
        self, query_embedding: np.ndarray, query_text: str, k: int
    ) -> list[DepositRecord]: ...
    async def log_event(self, event: dict[str, Any]) -> None: ...
    async def events(self) -> list[dict[str, Any]]: ...
