"""Postgres + pgvector store. candidate_pool = vector kNN (pgvector cosine) ∪
lexical kNN (pg_trgm similarity on the query column) over LIVE deposits — the
hybrid retrieval the engine then scope-gates, fuses, and thresholds. Satisfies
the same Store contract as InMemoryStore, so engine/corpus logic is identical.
(Runs on the deployed box.)"""
from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any
from uuid import UUID

import numpy as np
from sqlalchemy import Select, func, select, update

from ..config import Settings
from ..schemas import DepositRecord, RecallItem, TopicState
from .db import get_sessionmaker
from .models import Deposit, DepositorTrust, QueryEvent, Topic


def _to_record(r: Deposit) -> DepositRecord:
    return DepositRecord(
        id=r.id, query=r.query, embedding=np.asarray(r.query_embedding, dtype=np.float32),
        claim=r.claim, sources=r.sources, scope=r.scope, volatility=r.volatility,
        depositor=r.depositor, created_at=r.created_at,
        last_corroborated_at=r.last_corroborated_at,
        corroboration_count=r.corroboration_count,
        retired_at=r.retired_at, superseded_by=r.superseded_by,
        topic_id=r.topic_id, inferred_scope=r.inferred_scope,
        independent_corroboration_count=r.independent_corroboration_count,
    )


def _to_topic(t: Topic) -> TopicState:
    return TopicState(
        topic_id=t.topic_id, scope_key=t.scope_key,
        centroid=np.asarray(t.centroid, dtype=np.float32),
        base_volatility=t.base_volatility, exploration_rate=t.exploration_rate,
        agreement_count=t.agreement_count, disagreement_count=t.disagreement_count,
        last_verified_at=t.last_verified_at, observed_volatility=t.observed_volatility,
        half_life_factor=t.half_life_factor, created_at=t.created_at,
    )


class PostgresStore:
    def __init__(self, settings: Settings,
                 sessionmaker: Any | None = None) -> None:
        # tests inject a NullPool sessionmaker (fresh connection per session) so
        # asyncpg connections never leak across pytest event loops.
        self._sm = sessionmaker or get_sessionmaker(settings)

    async def add(self, rec: DepositRecord) -> UUID:
        async with self._sm() as s:
            s.add(Deposit(
                id=rec.id, query=rec.query, query_embedding=list(map(float, rec.embedding)),
                claim=rec.claim, sources=rec.sources, scope=rec.scope, volatility=rec.volatility,
                depositor=rec.depositor, created_at=rec.created_at,
                last_corroborated_at=rec.last_corroborated_at,
                corroboration_count=rec.corroboration_count,
                retired_at=rec.retired_at, superseded_by=rec.superseded_by,
                topic_id=rec.topic_id, inferred_scope=rec.inferred_scope,
                independent_corroboration_count=rec.independent_corroboration_count,
            ))
            await s.commit()
        return rec.id

    async def get(self, deposit_id: UUID) -> DepositRecord | None:
        async with self._sm() as s:
            row = await s.get(Deposit, deposit_id)
            return _to_record(row) if row else None

    async def _fetch(self, stmt: Select) -> list[Deposit]:
        async with self._sm() as s:
            return list((await s.execute(stmt)).scalars().all())

    async def candidate_pool(
        self, query_embedding: np.ndarray, query_text: str, k: int
    ) -> list[DepositRecord]:
        vec = list(map(float, query_embedding))
        live = Deposit.retired_at.is_(None)
        # Vector and lexical kNN are independent — run them concurrently
        # (each on its own pooled connection) instead of back-to-back.
        by_vec, by_lex = await asyncio.gather(
            self._fetch(
                select(Deposit).where(live)
                .order_by(Deposit.query_embedding.cosine_distance(vec)).limit(k)
            ),
            self._fetch(
                select(Deposit).where(live)
                .order_by(func.similarity(Deposit.query, query_text).desc()).limit(k)
            ),
        )
        seen: dict[UUID, DepositRecord] = {}
        for r in [*by_vec, *by_lex]:
            seen.setdefault(r.id, _to_record(r))
        return list(seen.values())

    async def mark_corroborated(
        self, deposit_id: UUID, now: datetime, extra_sources: list[dict[str, Any]],
        independent: bool = False,
    ) -> None:
        async with self._sm() as s:
            row = await s.get(Deposit, deposit_id)
            if row is None:
                raise KeyError(str(deposit_id))
            row.last_corroborated_at = now
            row.corroboration_count = (row.corroboration_count or 0) + 1
            if independent:
                row.independent_corroboration_count = (
                    row.independent_corroboration_count or 0) + 1
            row.sources = [*row.sources, *extra_sources]
            await s.commit()

    async def depositor_counts(self, depositor: str) -> tuple[int, int]:
        async with self._sm() as s:
            row = await s.get(DepositorTrust, depositor)
            return (row.agreed_count, row.contradicted_count) if row else (0, 0)

    async def bump_depositor(self, depositor: str, *, agreed: int = 0,
                             contradicted: int = 0, score: float = 0.0) -> None:
        async with self._sm() as s:
            row = await s.get(DepositorTrust, depositor)
            if row is None:
                row = DepositorTrust(depositor=depositor)
                s.add(row)
            row.agreed_count = (row.agreed_count or 0) + agreed
            row.contradicted_count = (row.contradicted_count or 0) + contradicted
            row.score = score   # derived value, persisted for observability
            await s.commit()

    async def retire(self, deposit_id: UUID, superseded_by: UUID, now: datetime) -> None:
        async with self._sm() as s:
            await s.execute(
                update(Deposit).where(Deposit.id == deposit_id)
                .values(retired_at=now, superseded_by=superseded_by)
            )
            await s.commit()

    # --- topics ---

    async def get_topic(self, topic_id: str) -> TopicState | None:
        async with self._sm() as s:
            row = await s.get(Topic, topic_id)
            return _to_topic(row) if row else None

    async def upsert_topic(self, topic: TopicState) -> None:
        async with self._sm() as s:
            row = await s.get(Topic, topic.topic_id)
            if row is None:
                row = Topic(topic_id=topic.topic_id, scope_key=topic.scope_key,
                            centroid=list(map(float, topic.centroid)),
                            base_volatility=topic.base_volatility,
                            exploration_rate=topic.exploration_rate,
                            created_at=topic.created_at)
                s.add(row)
            row.exploration_rate = topic.exploration_rate
            row.agreement_count = topic.agreement_count
            row.disagreement_count = topic.disagreement_count
            row.last_verified_at = topic.last_verified_at
            row.observed_volatility = topic.observed_volatility
            row.half_life_factor = topic.half_life_factor
            await s.commit()

    async def topics_for_scope(self, scope_key: str) -> list[TopicState]:
        async with self._sm() as s:
            rows = (await s.execute(
                select(Topic).where(Topic.scope_key == scope_key))).scalars().all()
            return [_to_topic(t) for t in rows]

    async def list_topics(self) -> list[TopicState]:
        async with self._sm() as s:
            rows = (await s.execute(select(Topic))).scalars().all()
            return [_to_topic(t) for t in rows]

    async def latest_live_deposit(self, topic_id: str) -> DepositRecord | None:
        async with self._sm() as s:
            row = (await s.execute(
                select(Deposit)
                .where(Deposit.topic_id == topic_id, Deposit.retired_at.is_(None))
                # id desc as tie-break: simulated clocks produce equal created_at,
                # and an unordered tie is nondeterministic on Postgres.
                .order_by(Deposit.created_at.desc(), Deposit.id.desc()).limit(1)
            )).scalar_one_or_none()
            return _to_record(row) if row else None

    # --- correction propagation ---

    async def recalls(self, since: datetime) -> list[RecallItem]:
        async with self._sm() as s:
            rows = (await s.execute(
                select(Deposit)
                .where(Deposit.retired_at.is_not(None), Deposit.retired_at >= since)
                .order_by(Deposit.retired_at, Deposit.id)
            )).scalars().all()
            return [RecallItem(
                retired_deposit_id=str(r.id),
                superseded_by=str(r.superseded_by) if r.superseded_by else None,
                topic_id=r.topic_id, retired_at=r.retired_at,
            ) for r in rows if r.retired_at is not None]

    # --- telemetry ---

    async def log_event(self, event: dict[str, Any]) -> None:
        # honor the caller's (possibly simulated) clock — the server_default is
        # only a fallback. Dropping event["ts"] made Postgres timestamps diverge
        # from the injected clock the in-memory store honored.
        ts = datetime.fromisoformat(event["ts"]) if event.get("ts") else None
        async with self._sm() as s:
            s.add(QueryEvent(
                ts=ts,
                query=event["query"], outcome=event["outcome"], reason=event.get("reason"),
                similarity=event.get("similarity"), confidence=event.get("confidence"),
                tokens_saved_estimate=event.get("tokens_saved_estimate"),
                tokens_spent_estimate=event.get("tokens_spent_estimate"),
                served_deposit_id=event.get("served_deposit_id"), volatility=event.get("volatility"),
                topic_id=event.get("topic_id"), detail=event.get("detail"),
            ))
            await s.commit()

    async def event_stats(self) -> dict[str, Any]:
        # Aggregate in SQL — never pull every event row into Python.
        async with self._sm() as s:
            by_outcome = {
                out: n for out, n in (await s.execute(
                    select(QueryEvent.outcome, func.count()).group_by(QueryEvent.outcome)
                )).all()
            }
            reasons = {
                (reason or "miss"): n for reason, n in (await s.execute(
                    select(QueryEvent.reason, func.count())
                    .where(QueryEvent.outcome.in_(("stale", "miss")))
                    .group_by(QueryEvent.reason)
                )).all()
            }
            saved, spent = (await s.execute(
                select(
                    func.coalesce(func.sum(QueryEvent.tokens_saved_estimate), 0),
                    func.coalesce(func.sum(QueryEvent.tokens_spent_estimate), 0),
                )
            )).one()
            explore_spent = (await s.execute(
                select(func.coalesce(func.sum(QueryEvent.tokens_spent_estimate), 0))
                .where(QueryEvent.outcome == "explore")
            )).scalar_one() or 0
            by_topic: dict[str, dict[str, int]] = {}
            for tid, out, n, ev_spent, ev_saved in (await s.execute(
                select(QueryEvent.topic_id, QueryEvent.outcome, func.count(),
                       func.coalesce(func.sum(QueryEvent.tokens_spent_estimate), 0),
                       func.coalesce(func.sum(QueryEvent.tokens_saved_estimate), 0))
                .where(QueryEvent.topic_id.is_not(None))
                .group_by(QueryEvent.topic_id, QueryEvent.outcome)
            )).all():
                t = by_topic.setdefault(tid, {"hits": 0, "agreed": 0, "disagreed": 0,
                                              "explore_tokens": 0, "saved_tokens": 0})
                if out in ("hit", "agreed", "disagreed"):
                    t["hits" if out == "hit" else out] += int(n)
                if out == "explore":
                    t["explore_tokens"] += int(ev_spent)
                t["saved_tokens"] += int(ev_saved)
            mean_ttc = (await s.execute(
                select(func.avg(QueryEvent.detail["time_to_correction_seconds"].as_float()))
                .where(QueryEvent.outcome == "disagreed",
                       QueryEvent.detail["time_to_correction_seconds"].is_not(None))
            )).scalar_one()
        return {"by_outcome": by_outcome, "reasons": reasons,
                "tokens_saved": int(saved), "tokens_spent": int(spent),
                "exploration_tokens_spent": int(explore_spent),
                "by_topic": by_topic,
                "mean_time_to_correction_seconds": float(mean_ttc) if mean_ttc is not None else None}
