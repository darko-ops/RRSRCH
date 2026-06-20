"""
The heart: deposit(), search(), corroborate().

INVIOLABLE RULE (see confidence.py): the serve-vs-miss decision here is made ONLY
by the deterministic confidence engine. The LLM (distiller) is optional and only
ever compresses sources->claim; it never touches confidence, matching, or the
serve decision. Corroboration agreement is decided by claim-embedding cosine, not
an LLM verdict.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable
from uuid import uuid4

from . import confidence as C
from . import matching, telemetry, volatility
from .config import Settings, get_settings
from .embedder import Embedder, cosine
from .schemas import DepositIn, DepositRecord, SearchOut, Source
from .store import CorpusStore


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Corpus:
    def __init__(
        self,
        store: CorpusStore,
        embedder: Embedder,
        settings: Settings | None = None,
        now: Callable[[], datetime] = _utcnow,
    ) -> None:
        self.store = store
        self.embedder = embedder
        self.settings = settings or get_settings()
        self.now = now

    # --- deposit ----------------------------------------------------------
    async def deposit(self, payload: DepositIn, *, created_at: datetime | None = None) -> DepositRecord:
        vol = volatility.classify(payload.query, payload.volatility_hint)
        emb = self.embedder.encode([payload.query])[0]
        rec = DepositRecord(
            id=uuid4(),
            query_text=payload.query,
            embedding=emb,
            claim=payload.claim,
            sources=[s.model_dump(mode="json") for s in payload.sources],
            scope=payload.scope,
            volatility=vol,
            depositor=payload.depositor,
            base_confidence=C.base(payload.depositor),
            created_at=created_at or self.now(),
        )
        await self.store.add_deposit(rec)
        return rec

    # --- search -----------------------------------------------------------
    async def search(
        self, query: str, scope: dict[str, Any] | None = None, threshold: float | None = None,
        *, caller_cold_cost: int | None = None,
    ) -> SearchOut:
        scope = scope or {}
        threshold = self.settings.serve_threshold if threshold is None else threshold
        now = self.now()
        cold = caller_cold_cost or self.settings.cold_path_estimate_tokens

        cands = await matching.find_candidates(
            self.store, self.embedder, query, scope,
            k=self.settings.candidate_k, similarity_floor=self.settings.similarity_floor,
        )

        if not cands:
            await self._log(query, "miss", None, None, None, saved=0, spent=cold, vol=None)
            return SearchOut(outcome="miss", advice="re-derive: nothing in the corpus matches.")

        rec, sim = cands[0]
        conf = C.confidence(rec.to_state(), now)
        if C.serve_decision(conf, threshold) == "serve":
            served = telemetry.estimate_tokens(rec.claim) + telemetry.estimate_tokens(str(rec.sources))
            saved = max(0, cold - served)
            await self._log(query, "hit", rec.id, sim, conf, saved=saved, spent=served, vol=rec.volatility)
            return SearchOut(
                outcome="hit",
                advice="use this: confidence is above threshold.",
                claim=rec.claim,
                confidence=round(conf, 4),
                similarity=round(sim, 4),
                deposited_age_seconds=(now - rec.created_at).total_seconds(),
                provenance=rec.depositor,
                sources=[Source(**s) for s in rec.sources],
                deposit_id=str(rec.id),
            )

        # matched but not trustworthy
        await self._log(query, "stale", rec.id, sim, conf, saved=0, spent=cold, vol=rec.volatility)
        return SearchOut(
            outcome="stale",
            advice="re-derive: a matching answer exists but its confidence is below threshold.",
            confidence=round(conf, 4),
            similarity=round(sim, 4),
            deposit_id=str(rec.id),
        )

    # --- corroborate (the stale-answer correction loop) -------------------
    async def corroborate(
        self, query: str, fresh_claim: str, scope: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        scope = scope or {}
        now = self.now()
        cands = await matching.find_candidates(
            self.store, self.embedder, query, scope,
            k=self.settings.candidate_k, similarity_floor=self.settings.similarity_floor,
        )
        if not cands:
            return {"result": "no_match"}

        rec, _ = cands[0]
        # Agreement is deterministic: cosine of the two CLAIM embeddings. No LLM verdict.
        agree = cosine(
            self.embedder.encode([fresh_claim])[0], self.embedder.encode([rec.claim])[0]
        ) >= self.settings.agreement_floor

        if agree:
            rec.corroboration_count += 1
            rec.last_corroborated_at = now
            await self.store.update_deposit(rec)
            await self.store.add_corroboration({"deposit_id": rec.id, "ts": now, "agreed": True})
            return {"result": "agreed", "deposit_id": str(rec.id)}

        # disagreement: penalize, possibly retire, and supersede with a fresh deposit.
        rec.disagreement_count += 1
        new = await self.deposit(
            DepositIn(query=query, claim=fresh_claim, sources=[], scope=scope,
                      volatility_hint=rec.volatility, depositor="corroborator"),
            created_at=now,
        )
        rec.superseded_by = new.id
        if C.confidence(rec.to_state(), now) < self.settings.retire_floor:
            rec.retired = True
        await self.store.update_deposit(rec)
        await self.store.add_corroboration(
            {"deposit_id": rec.id, "ts": now, "agreed": False, "new_deposit_id": new.id}
        )
        return {"result": "disagreed", "deposit_id": str(rec.id), "new_deposit_id": str(new.id)}

    async def _log(self, query, outcome, dep_id, sim, conf, *, saved, spent, vol) -> None:
        await self.store.add_query_event({
            "ts": self.now(), "query_text": query, "outcome": outcome,
            "matched_deposit_id": dep_id, "similarity": sim, "confidence_at_serve": conf,
            "tokens_saved_estimate": saved, "tokens_spent_estimate": spent, "volatility": vol,
        })

    async def savings_report(self) -> dict[str, Any]:
        return telemetry.savings_report(
            await self.store.query_events(), self.settings.cold_path_estimate_tokens
        )
