"""The core both surfaces (MCP + FastAPI) share. Ties store + matching + freshness
+ telemetry into the two operations: deposit() and search().

CORE PRINCIPLE: serve-vs-miss is deterministic — matching similarity (vectors +
lexical, never an LLM) clears a threshold, then freshness decay clears a threshold.
The LLM is not in this path."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable

from . import telemetry
from .config import Settings
from .freshness import decay as fresh
from .matching import engine
from .embeddings import Embedder
from .schemas import DepositIn, DepositRecord, SearchResult, Source
from .store.base import Store


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Corpus:
    def __init__(self, store: Store, embedder: Embedder, settings: Settings,
                 now: Callable[[], datetime] = _utcnow) -> None:
        self.store = store
        self.embedder = embedder
        self.settings = settings
        self.now = now
        self._half_lives = fresh.half_lives_from_settings(settings)

    async def deposit(self, payload: DepositIn, *, created_at: datetime | None = None) -> DepositRecord:
        emb = self.embedder.encode([payload.query])[0]
        rec = DepositRecord.new(
            query=payload.query, embedding=emb, claim=payload.claim,
            sources=[s.model_dump(mode="json") for s in payload.sources],
            scope=payload.scope, volatility=payload.volatility_hint, depositor=payload.depositor,
            created_at=created_at or self.now(),
        )
        await self.store.add(rec)
        return rec

    async def search(self, query: str, scope: dict[str, Any] | None = None,
                     *, caller_cold_cost: int | None = None) -> SearchResult:
        s = self.settings
        now = self.now()
        cold = caller_cold_cost or s.cold_path_estimate_tokens

        ranked = await engine.rank(
            self.store, self.embedder, query, scope,
            k=s.candidate_k, vector_weight=s.vector_weight, lexical_weight=s.lexical_weight,
        )

        if not ranked or ranked[0].similarity < s.similarity_threshold:
            reason = "no_match" if not ranked else "below_similarity_threshold"
            return await self._miss(query, reason, cold,
                                    sim=ranked[0].similarity if ranked else None)

        top = ranked[0]
        rec = top.record
        confidence = fresh.decay((now - rec.created_at).total_seconds(), rec.volatility, self._half_lives)

        if not fresh.should_serve(confidence, s.freshness_threshold):
            return await self._miss(query, "stale_below_threshold", cold,
                                    sim=top.similarity, conf=confidence, dep_id=str(rec.id))

        served = telemetry.estimate_tokens(rec.claim) + telemetry.estimate_tokens(str(rec.sources))
        await self._log(query, "hit", None, sim=top.similarity, conf=confidence,
                        saved=max(0, cold - served), spent=served, dep_id=str(rec.id),
                        volatility=rec.volatility)
        return SearchResult(
            serve=True, outcome="hit", claim=rec.claim, confidence=round(confidence, 4),
            similarity=round(top.similarity, 4), age_seconds=(now - rec.created_at).total_seconds(),
            sources=[Source(**x) for x in rec.sources], scope=rec.scope, depositor=rec.depositor,
            deposit_id=str(rec.id),
        )

    async def _miss(self, query, reason, cold, *, sim=None, conf=None, dep_id=None) -> SearchResult:
        await self._log(query, "miss", reason, sim=sim, conf=conf, saved=0, spent=cold,
                        dep_id=dep_id, volatility=None)
        return SearchResult(serve=False, outcome="miss", reason=reason,
                            similarity=round(sim, 4) if sim is not None else None,
                            confidence=round(conf, 4) if conf is not None else None,
                            deposit_id=dep_id)

    async def _log(self, query, outcome, reason, *, sim, conf, saved, spent, dep_id, volatility) -> None:
        await self.store.log_event({
            "ts": self.now().isoformat(), "query": query, "outcome": outcome, "reason": reason,
            "similarity": sim, "confidence": conf, "tokens_saved_estimate": saved,
            "tokens_spent_estimate": spent, "served_deposit_id": dep_id, "volatility": volatility,
        })

    async def metrics(self) -> dict[str, Any]:
        return telemetry.metrics(await self.store.events(), self.settings.cold_path_estimate_tokens)
