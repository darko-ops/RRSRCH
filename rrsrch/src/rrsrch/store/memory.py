"""In-memory store: vector kNN (numpy cosine) ∪ lexical kNN (trigram). Used by the
eval and tests so the matching engine, bandit, and verifier run with no external
services. Mirrors PostgresStore's contract exactly."""
from __future__ import annotations

import heapq
from datetime import datetime
from typing import Any
from uuid import UUID

import numpy as np

from ..embeddings import cosine
from ..matching.lexical import lexical_score
from ..schemas import DepositRecord, RecallItem, TopicState


class InMemoryStore:
    def __init__(self) -> None:
        self._d: dict[UUID, DepositRecord] = {}
        self._topics: dict[str, TopicState] = {}
        self._events: list[dict[str, Any]] = []
        self._trust: dict[str, list[int]] = {}   # depositor → [agreed, contradicted]
        self._attested: dict[str, float] = {}    # depositor → verified level

    async def add(self, rec: DepositRecord) -> UUID:
        self._d[rec.id] = rec
        return rec.id

    async def get(self, deposit_id: UUID) -> DepositRecord | None:
        return self._d.get(deposit_id)

    async def candidate_pool(
        self, query_embedding: np.ndarray, query_text: str, k: int
    ) -> list[DepositRecord]:
        live = [r for r in self._d.values() if r.retired_at is None]
        if not live:
            return []
        # top-k per signal without sorting the whole corpus twice (O(n log k)).
        by_vec = heapq.nlargest(k, live, key=lambda r: cosine(query_embedding, r.embedding))
        by_lex = heapq.nlargest(k, live, key=lambda r: lexical_score(query_text, r.query))
        seen: dict[UUID, DepositRecord] = {}
        for r in [*by_vec, *by_lex]:
            seen.setdefault(r.id, r)
        return list(seen.values())

    async def mark_corroborated(
        self, deposit_id: UUID, now: datetime, extra_sources: list[dict[str, Any]],
        independent: bool = False,
    ) -> None:
        rec = self._d[deposit_id]
        rec.last_corroborated_at = now
        rec.corroboration_count += 1
        if independent:
            rec.independent_corroboration_count += 1
        rec.sources = [*rec.sources, *extra_sources]

    async def depositor_counts(self, depositor: str) -> tuple[int, int]:
        a, c = self._trust.get(depositor, (0, 0))
        return a, c

    async def bump_depositor(self, depositor: str, *, agreed: int = 0,
                             contradicted: int = 0, score: float = 0.0) -> None:
        cur = self._trust.setdefault(depositor, [0, 0])
        cur[0] += agreed
        cur[1] += contradicted

    async def attested_level(self, depositor: str) -> float | None:
        return self._attested.get(depositor)

    async def set_attested_level(self, depositor: str, level: float) -> None:
        # keep the HIGHEST verified level (a weaker later token never downgrades)
        self._attested[depositor] = max(level, self._attested.get(depositor, 0.0))

    async def retire(self, deposit_id: UUID, superseded_by: UUID, now: datetime) -> None:
        rec = self._d[deposit_id]
        rec.retired_at = now
        rec.superseded_by = superseded_by

    # --- topics ---

    async def get_topic(self, topic_id: str) -> TopicState | None:
        return self._topics.get(topic_id)

    async def upsert_topic(self, topic: TopicState) -> None:
        self._topics[topic.topic_id] = topic

    async def topics_for_scope(self, scope_key: str) -> list[TopicState]:
        return [t for t in self._topics.values() if t.scope_key == scope_key]

    async def list_topics(self) -> list[TopicState]:
        return list(self._topics.values())

    async def latest_live_deposit(self, topic_id: str) -> DepositRecord | None:
        live = [r for r in self._d.values()
                if r.topic_id == topic_id and r.retired_at is None]
        # UUID int-compare matches Postgres's bytewise uuid ordering — the two
        # stores must break created_at ties identically.
        return max(live, key=lambda r: (r.created_at, r.id.int)) if live else None

    # --- correction propagation ---

    async def recalls(self, since: datetime) -> list[RecallItem]:
        rows = [r for r in self._d.values()
                if r.retired_at is not None and r.retired_at >= since]
        rows.sort(key=lambda r: (r.retired_at, r.id.int))  # match PG ordering
        return [RecallItem(retired_deposit_id=str(r.id),
                           superseded_by=str(r.superseded_by) if r.superseded_by else None,
                           topic_id=r.topic_id, retired_at=r.retired_at)  # type: ignore[arg-type]
                for r in rows]

    # --- telemetry ---

    async def log_event(self, event: dict[str, Any]) -> None:
        self._events.append(event)

    async def event_stats(self) -> dict[str, Any]:
        by_outcome: dict[str, int] = {}
        reasons: dict[str, int] = {}
        by_topic: dict[str, dict[str, int]] = {}
        ttc: list[float] = []
        saved = spent = explore_spent = 0
        for e in self._events:
            out = e["outcome"]
            by_outcome[out] = by_outcome.get(out, 0) + 1
            if out in ("stale", "miss"):
                reasons[e.get("reason") or "miss"] = reasons.get(e.get("reason") or "miss", 0) + 1
            ev_spent = e.get("tokens_spent_estimate") or 0
            saved += e.get("tokens_saved_estimate") or 0
            spent += ev_spent
            if out == "explore":
                explore_spent += ev_spent
            if (tid := e.get("topic_id")) is not None:
                t = by_topic.setdefault(tid, {"hits": 0, "agreed": 0, "disagreed": 0,
                                              "explore_tokens": 0, "saved_tokens": 0})
                if out in ("hit", "agreed", "disagreed"):
                    t["hits" if out == "hit" else out] += 1
                if out == "explore":
                    t["explore_tokens"] += ev_spent
                t["saved_tokens"] += e.get("tokens_saved_estimate") or 0
            detail = e.get("detail") or {}
            if out == "disagreed" and "time_to_correction_seconds" in detail:
                ttc.append(float(detail["time_to_correction_seconds"]))
        return {"by_outcome": by_outcome, "reasons": reasons,
                "tokens_saved": saved, "tokens_spent": spent,
                "exploration_tokens_spent": explore_spent,
                "by_topic": by_topic,
                "mean_time_to_correction_seconds": (sum(ttc) / len(ttc)) if ttc else None}
