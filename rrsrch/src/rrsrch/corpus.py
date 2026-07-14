"""The core both surfaces (MCP + FastAPI) share. Ties store + matching + confidence
+ topics + exploration + telemetry into the operations: deposit(), search(),
corroborate(), lookup(), recalls().

=============================================================================
THE INVIOLABLE RULE: the confidence score, the serve-vs-miss decision, the
explore-vs-exploit decision, and the corroboration agreement verdict are ALL
DETERMINISTIC CODE. An LLM may help with fuzzy, recoverable tasks (judging if
two questions are similar, distilling sources into a claim, EXTRACTING fields
from a claim) but MUST NEVER compute confidence, decide serve-vs-research,
decide explore-vs-exploit, or render the agreement verdict. Everything in this
file — matching threshold, confidence decay, bandit updates, claim agreement,
retirement — is plain code. Do not let an LLM creep into this path.
=============================================================================
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from random import Random
from typing import TYPE_CHECKING, Any, Callable
from uuid import UUID

from . import agreement, confidence as conf, exploration, telemetry, topics
from .matching import scope as scope_mod
from .config import Settings
from .embeddings import Embedder, encode_async
from .matching import engine
from .matching import rerank as rerank_mod
from .schemas import (CorroborateResult, DepositIn, DepositRecord, RecallItem,
                      SearchResult, Source, TopicState)
from .store.base import Store

if TYPE_CHECKING:  # avoid an import cycle: verification imports Corpus for typing
    from .verification import SearchProvider


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Corpus:
    def __init__(self, store: Store, embedder: Embedder, settings: Settings,
                 now: Callable[[], datetime] = _utcnow,
                 rng: Random | None = None,
                 provider: "SearchProvider | None" = None,
                 extractor: agreement.Extractor | None = None,
                 reranker: rerank_mod.Reranker | None = None) -> None:
        self.store = store
        self.embedder = embedder
        self.settings = settings
        self.now = now
        # rng is injected so explore-vs-exploit is seedable in tests (real in prod).
        self.rng = rng or Random()
        # provider is the "fresh search" capability used for exploration and
        # self-verification. None ⇒ search() always exploits (no inline exploration).
        self.provider = provider
        # An LLM may implement Extractor (it only PROPOSES fields); default is regex.
        self.extractor = extractor or agreement.RegexExtractor()
        # The second-stage MATCHER (the one zone a model may judge). None ⇒ the
        # fused-threshold serve path; set ⇒ its score replaces the cosine
        # threshold as the match signal. It never touches confidence/trust.
        self.reranker = reranker if reranker is not None else rerank_mod.get_reranker(settings)
        # attestation verification is deterministic code behind an interface;
        # the default (local/none per settings) never requires a live service.
        from .attestation import build_attestation_verifier
        self.attestor = build_attestation_verifier(settings)
        self._half_lives = conf.half_lives_from_settings(settings)

    # ------------------------------------------------------------------ deposit

    async def deposit(self, payload: DepositIn, *, created_at: datetime | None = None) -> DepositRecord:
        emb = (await encode_async(self.embedder, [payload.query]))[0]
        when = created_at or self.now()
        await self._verify_attestation(payload.attestation, payload.depositor)
        topic_id = await topics.assign(self.store, emb, payload.scope,
                                       payload.volatility_hint, when, self.settings)
        rec = DepositRecord.new(
            query=payload.query, embedding=emb, claim=payload.claim,
            sources=[s.model_dump(mode="json") for s in payload.sources],
            scope=payload.scope, volatility=payload.volatility_hint, depositor=payload.depositor,
            created_at=when, topic_id=topic_id, attestation=payload.attestation,
            derivation_tokens=payload.derivation_tokens,
            # implicit scope lives in the query prose — extract once, at write time
            inferred_scope={d: sorted(v) for d, v in scope_mod.infer(payload.query).items()},
        )
        await self.store.add(rec)
        return rec

    # ------------------------------------------------------------------ search

    async def search(self, query: str, scope: dict[str, Any] | None = None,
                     *, caller_cold_cost: int | None = None) -> SearchResult:
        s = self.settings
        now = self.now()
        cold = caller_cold_cost or s.cold_path_estimate_tokens

        ranked = await engine.rank(
            self.store, self.embedder, query, scope,
            k=s.candidate_k, vector_weight=s.vector_weight, lexical_weight=s.lexical_weight,
        )
        if not ranked:
            return await self._no_serve(query, "miss", "no_match", cold, sim=None)

        # MATCH SELECTION — the one zone where a model may judge. Two paths:
        # fused-threshold (Phase 2, reranker "none") or cross-encoder rerank
        # (the rerank score, not fused cosine, is the serve signal). Both keep
        # the deterministic safety gates and feed the SAME deterministic
        # confidence/trust tail below.
        if self.reranker is None:
            top, detail, miss = await self._select_fused(query, ranked, cold)
        else:
            top, detail, miss = await self._select_reranked(query, ranked, cold)
        if top is None:
            assert miss is not None
            return miss

        rec = top.record
        topic = await self.store.get_topic(rec.topic_id) if rec.topic_id else None
        confidence = await self._confidence(rec, topic, now)

        if not conf.should_serve(confidence, s.confidence_threshold):
            # A stale outcome is NOT a plain miss: the corpus knows this question,
            # but the answer has decayed below trust. The caller should re-derive
            # and corroborate() so the deposit is either re-earned or superseded.
            return await self._no_serve(query, "stale", "confidence_below_threshold", cold,
                                        sim=top.similarity, c=confidence, dep_id=str(rec.id),
                                        volatility=rec.volatility, topic_id=rec.topic_id)

        # EXPLORE vs EXPLOIT: on a hit that would normally be served, spend a fresh
        # derivation with probability exploration_rate(topic) and feed the result
        # into corroborate(). The coin flip is the injected RNG; the rate came from
        # deterministic bandit updates. No LLM decides this.
        if (self.provider is not None and topic is not None
                and exploration.should_explore(self.rng, topic.exploration_rate)):
            rec, confidence = await self._explore(rec, topic, trigger="search")
            topic = await self.store.get_topic(rec.topic_id) if rec.topic_id else topic

        return await self._serve(query, rec, top.similarity, confidence, cold, now,
                                 detail=detail)

    async def _select_fused(
        self, query: str, ranked: list[engine.Match], cold: int,
    ) -> tuple[engine.Match | None, dict[str, Any] | None, SearchResult | None]:
        """Phase-2 selection: fused similarity clears the threshold, then the
        INTENT GUARD — the LAST check before a candidate can become a hit.
        Same-scope, opposite-intent queries ("require X?" vs "NOT require X?",
        "enable" vs "disable") embed near-identically, so similarity alone
        would serve a confidently wrong answer. The verdict is deterministic
        code over fields from the ONE shared Extractor (agreement.py) —
        embedding similarity retrieves candidates, it never overrides intent."""
        s = self.settings
        if ranked[0].similarity < s.similarity_threshold:
            return None, None, await self._no_serve(
                query, "miss", "below_similarity_threshold", cold, sim=ranked[0].similarity)
        query_fields = self.extractor.extract(query)
        rejected: list[dict[str, Any]] = []
        for cand in ranked:
            if cand.similarity < s.similarity_threshold:
                break                          # ranked is sorted; nothing below can serve
            iv = agreement.intent_verdict(query_fields,
                                          self.extractor.extract(cand.record.query),
                                          facet_gate=s.facet_gate)
            if iv.match:
                return cand, {"intent_rejected": rejected} if rejected else None, None
            rejected.append({"deposit_id": str(cand.record.id), "rule": iv.rule,
                             "similarity": round(cand.similarity, 4),
                             "fields": iv.detail})
        # every above-threshold candidate flipped intent → this is a MISS:
        # a false hit is a wrong answer; a fresh search is just a cost.
        return None, None, await self._no_serve(
            query, "miss", "intent_mismatch", cold, sim=ranked[0].similarity,
            detail={"intent_rejected": rejected})

    async def _select_reranked(
        self, query: str, ranked: list[engine.Match], cold: int,
    ) -> tuple[engine.Match | None, dict[str, Any] | None, SearchResult | None]:
        """Reranked selection: the deterministic SAFETY gates (scope already ran
        in engine.rank; polarity/predicate — and facet, if enabled — here) veto
        first, then the cross-encoder scores the survivors and its score, not
        fused cosine, decides match-vs-miss. No fused-similarity threshold: the
        rerank threshold IS the match judgment (calibrated, see config)."""
        s = self.settings
        assert self.reranker is not None
        query_fields = self.extractor.extract(query)
        survivors: list[engine.Match] = []
        rejected: list[dict[str, Any]] = []
        for cand in ranked[: s.rerank_top_k]:
            iv = agreement.intent_verdict(query_fields,
                                          self.extractor.extract(cand.record.query),
                                          facet_gate=s.facet_gate)
            if iv.match:
                survivors.append(cand)
            else:
                rejected.append({"deposit_id": str(cand.record.id), "rule": iv.rule,
                                 "similarity": round(cand.similarity, 4),
                                 "fields": iv.detail})
        if not survivors:
            return None, None, await self._no_serve(
                query, "miss", "intent_mismatch", cold, sim=ranked[0].similarity,
                detail={"intent_rejected": rejected})
        scores = await rerank_mod.score_async(
            self.reranker, query, [c.record.query for c in survivors])
        best = max(range(len(survivors)), key=scores.__getitem__)
        top, score = survivors[best], scores[best]
        detail: dict[str, Any] = {"rerank_score": round(score, 4)}
        if rejected:
            detail["intent_rejected"] = rejected
        if score < s.rerank_threshold:
            return None, None, await self._no_serve(
                query, "miss", "below_rerank_threshold", cold, sim=top.similarity,
                detail=detail)
        return top, detail, None

    async def _serve(self, query: str, rec: DepositRecord, similarity: float,
                     confidence: float, cold: int, now: datetime,
                     detail: dict[str, Any] | None = None) -> SearchResult:
        served = telemetry.estimate_tokens(rec.claim) + telemetry.estimate_tokens(
            json.dumps(rec.sources))
        # Savings basis: if the deposit carries its MEASURED production cost,
        # this hit's savings is measured (that cost minus what we served).
        # Otherwise it stays an estimate against the configured cold path —
        # and is tagged so metrics can report the two honestly, separately.
        if rec.derivation_tokens is not None:
            saved, basis = max(0, rec.derivation_tokens - served), "measured"
        else:
            saved, basis = max(0, cold - served), "estimated"
        detail = {**(detail or {}), "cold_basis": basis}
        await self._log(query, "hit", None, sim=similarity, c=confidence,
                        saved=saved, spent=served, dep_id=str(rec.id),
                        volatility=rec.volatility, topic_id=rec.topic_id, detail=detail)
        return SearchResult(
            serve=True, outcome="hit", claim=rec.claim, confidence=round(confidence, 4),
            similarity=round(similarity, 4), age_seconds=(now - rec.created_at).total_seconds(),
            sources=[Source(**x) for x in rec.sources], scope=rec.scope, depositor=rec.depositor,
            deposit_id=str(rec.id),
        )

    async def _explore(self, rec: DepositRecord, topic: TopicState,
                       *, trigger: str) -> tuple[DepositRecord, float]:
        """Run a fresh derivation and corroborate it against the cached claim.
        Returns the record to serve (the fresh one if the cache was wrong) and its
        live confidence. Exploration spend is logged so the budget is auditable."""
        assert self.provider is not None
        research = await self.provider.research(rec.query, rec.scope)
        spend = research.tokens_spent or self.settings.cold_path_estimate_tokens
        await self.store.log_event({
            "ts": self.now().isoformat(), "query": rec.query, "outcome": "explore",
            "reason": trigger, "similarity": None, "confidence": None,
            "tokens_saved_estimate": 0, "tokens_spent_estimate": spend,
            "served_deposit_id": str(rec.id), "volatility": rec.volatility,
            "topic_id": rec.topic_id, "detail": {"trigger": trigger},
        })
        out = await self.corroborate(str(rec.id), research.claim,
                                     sources=research.sources, depositor=f"rrsrch-{trigger}",
                                     derivation_tokens=research.tokens_spent or None)
        if out.outcome == "disagreed" and out.new_deposit_id:
            fresh = await self.store.get(UUID(out.new_deposit_id))
            if fresh is not None:
                return fresh, await self._confidence(fresh, topic, self.now())
        refreshed = await self.store.get(rec.id) or rec
        # agreed → anchor moved to now → confidence re-earned at the trust base
        return refreshed, await self._confidence(refreshed, topic, self.now())

    # ------------------------------------------------------------- corroborate

    async def corroborate(self, deposit_id: str, claim: str,
                          sources: list[Source] | None = None,
                          depositor: str = "local",
                          attestation: str | None = None,
                          derivation_tokens: int | None = None) -> CorroborateResult:
        """Re-earn or retire a deposit against a freshly derived claim.

        DETERMINISTIC verdict (agreement.py): polarity, numbers, entities are
        compared in code; the lexical gate is only the fallback. Conservative by
        design — a false "agreed" wrongly re-earns confidence; a false
        "disagreed" merely replaces the claim with the fresh one — recoverable.

        - agreed    → confidence anchor moves to now (re-earned to 1.0); sources
                      merged; topic exploration_rate decays toward the floor and
                      its half-life stretches (settled knowledge is cheap to trust).
        - disagreed → old deposit retired with superseded_by → new deposit; topic
                      exploration_rate grows toward the ceiling, half-life shrinks,
                      and last_verified_at resets so self-verification returns
                      immediately. The error does not persist.
        """
        rec = await self.store.get(UUID(deposit_id))
        if rec is None:
            return CorroborateResult(outcome="not_found", deposit_id=deposit_id)
        if rec.retired_at is not None:
            return CorroborateResult(
                outcome="retired", deposit_id=deposit_id,
                superseded_by=str(rec.superseded_by) if rec.superseded_by else None)

        now = self.now()
        src_dicts = [s.model_dump(mode="json") for s in (sources or [])]
        v = agreement.verdict(claim, rec.claim, self.extractor, self.settings)
        topic = await self.store.get_topic(rec.topic_id) if rec.topic_id else None

        # INDEPENDENCE (the Sybil guard): only a DIFFERENT depositor's
        # corroboration moves the author's trust or vouches the deposit.
        # rrsrch's own verifier is independent; the original author is not.
        independent = depositor != rec.depositor
        # STRONG vouch (Phase 3, the collusion breaker): the base-1.0 float
        # requires the corroborator to hold a VERIFIED attestation bound to a
        # DISTINCT identity — or to be rrsrch's own verifier. Unattested
        # corroborators still agree, still re-earn the anchor, still move track
        # record — but N sock-puppets can never float a lie over the serve line,
        # because minting distinct attested identities is what Sybils can't do.
        corroborator_attested = await self._verify_attestation(attestation, depositor)
        strong_voucher = independent and (
            depositor.startswith("rrsrch-") or corroborator_attested
            or not self.settings.attested_vouch_required   # Phase-2-rules A/B lever
        )

        if v.agree:
            author_base = await self._depositor_base(rec.depositor)
            # Self-agreement may re-earn the anchor ONLY while the author is in
            # good standing: single-player's own stale→re-derive→corroborate
            # loop keeps working, but a proven-bad agent self-corroborating
            # gains NOTHING — no trust, no anchor, no serve (its base is below
            # the threshold regardless of anchor).
            if independent or author_base >= self.settings.confidence_threshold:
                await self.store.mark_corroborated(rec.id, now, src_dicts,
                                                   independent=strong_voucher)
            if independent:
                await self._bump_trust(rec.depositor, agreed=1)
            if topic is not None:
                await self._update_topic(topic, agreed=True)
            served_base = 1.0 if (strong_voucher or rec.independent_corroboration_count
                                  ) else await self._depositor_base(rec.depositor)
            await self._log_corroboration(rec, "agreed", v, topic,
                                          independent=independent)
            return CorroborateResult(outcome="agreed", deposit_id=deposit_id,
                                     confidence=round(served_base, 4),
                                     claim_similarity=round(v.lexical, 4),
                                     rule=v.rule)

        # Disagreed. WHO is disagreeing matters (the grief guard): only a
        # corroborator of equal-or-higher trust — or rrsrch's own verifier —
        # may retire the deposit and penalize its author. A lower-trust
        # contradictor gets a recorded DISPUTE but cannot supersede a
        # better-trusted author's claim (else a proven-bad agent could grief
        # honest authors' trust down and poison the corpus via the
        # corroboration channel). Deterministic: trust vs trust, no LLM.
        is_verifier = depositor.startswith("rrsrch-")
        if independent and not is_verifier:
            if await self._trust(depositor) < await self._trust(rec.depositor):
                await self._log_corroboration(rec, "disputed", v, topic,
                                              independent=independent)
                return CorroborateResult(outcome="disputed", deposit_id=deposit_id,
                                         claim_similarity=round(v.lexical, 4),
                                         rule=v.rule)

        # Same question, new answer. Reuse the stored query embedding —
        # the query text is unchanged, so re-encoding it would be pure waste.
        ttc = self._time_to_correction(rec, topic, now)
        new = DepositRecord.new(
            query=rec.query, embedding=rec.embedding, claim=claim, sources=src_dicts,
            scope=rec.scope, volatility=rec.volatility, depositor=depositor, created_at=now,
            topic_id=rec.topic_id,
            inferred_scope=rec.inferred_scope,   # same query text → same implicit scope
            derivation_tokens=derivation_tokens,  # measured cost of the fresh derivation
        )
        await self.store.add(new)
        await self.store.retire(rec.id, new.id, now)
        # THE AGE RULE: a claim contradicted while still inside its volatility
        # class's half-life was wrong when asserted → the author is penalized.
        # A claim that OUTLIVED its half-life before being contradicted simply
        # aged out — world churn, not dishonesty — so the correction happens
        # but the author's record is untouched. Without this, the most prolific
        # honest depositors ratchet downward every time reality moves.
        vol = (topic.observed_volatility if topic else None) or rec.volatility
        eff_hl = conf.half_life_seconds(vol, self._half_lives) * (
            topic.half_life_factor if topic else 1.0)
        anchor = rec.last_corroborated_at or rec.created_at
        young = (now - anchor).total_seconds() < eff_hl
        # Part 0 trust-guard: a polarity_mismatch driven purely by clause
        # CARDINALITY (the sets differ because one wording segments into more
        # clauses — connectives outside the and/but/while set — not because a
        # single proposition cleanly flipped) still retires-and-replaces, but
        # must NOT dock the author: an honest multi-clause paraphrase is a
        # wording difference, not a lie. A clean singleton {pos} vs {neg} flip
        # keeps the full penalty.
        clean_flip = True
        if v.rule == "polarity_mismatch":
            a_pol = v.detail["new"]["polarity"]
            b_pol = v.detail["old"]["polarity"]
            clean_flip = len(a_pol) == 1 and len(b_pol) == 1
        if independent and young and clean_flip:
            await self._bump_trust(rec.depositor, contradicted=1)
        if topic is not None:
            await self._update_topic(topic, agreed=False)
        await self._log_corroboration(rec, "disagreed", v, topic, ttc=ttc,
                                      independent=independent)
        return CorroborateResult(outcome="disagreed", deposit_id=deposit_id,
                                 new_deposit_id=str(new.id),
                                 claim_similarity=round(v.lexical, 4), rule=v.rule)

    async def _update_topic(self, topic: TopicState, *, agreed: bool) -> None:
        """Bandit update — pure functions from exploration.py, bounded config knobs."""
        s = self.settings
        if agreed:
            topic.agreement_count += 1
            topic.exploration_rate = exploration.rate_on_agreement(topic.exploration_rate, s)
            topic.half_life_factor = exploration.half_life_factor_on_agreement(
                topic.half_life_factor, s)
        else:
            topic.disagreement_count += 1
            topic.exploration_rate = exploration.rate_on_disagreement(topic.exploration_rate, s)
            topic.half_life_factor = exploration.half_life_factor_on_disagreement(
                topic.half_life_factor, s)
            topic.last_verified_at = None   # ⇒ max priority: immediate re-verification
        topic.observed_volatility = exploration.observed_volatility(
            topic.agreement_count, topic.disagreement_count, s)
        await self.store.upsert_topic(topic)

    def _time_to_correction(self, rec: DepositRecord, topic: TopicState | None,
                            now: datetime) -> float:
        """Seconds between the moment the claim decayed below the serve threshold
        and the moment it was actually corrected (now). 0 if caught before staling."""
        vol = (topic.observed_volatility if topic else None) or rec.volatility
        factor = topic.half_life_factor if topic else 1.0
        half_life = conf.half_life_seconds(vol, self._half_lives) * factor
        anchor = rec.last_corroborated_at or rec.created_at
        stale_age = half_life * math.log2(1.0 / self.settings.confidence_threshold)
        stale_at_seconds = stale_age - (now - anchor).total_seconds()
        return max(0.0, -stale_at_seconds)

    # ------------------------------------------------ lookup & recall feed

    async def lookup(self, deposit_id: str) -> dict[str, Any]:
        """Direct lookup by id — how a holder of a cached answer learns it's dead.
        Follows the supersession chain to the live replacement."""
        rec = await self.store.get(UUID(deposit_id))
        if rec is None:
            return {"found": False, "deposit_id": deposit_id}
        out: dict[str, Any] = {
            "found": True, "deposit_id": deposit_id,
            "retired": rec.retired_at is not None,
            "topic_id": rec.topic_id,
        }
        if rec.retired_at is None:
            topic = await self.store.get_topic(rec.topic_id) if rec.topic_id else None
            out["claim"] = rec.claim
            out["confidence"] = round(await self._confidence(rec, topic, self.now()), 4)
            return out
        out["retired_at"] = rec.retired_at.isoformat()
        out["superseded_by"] = str(rec.superseded_by) if rec.superseded_by else None
        # follow the chain to the live end (bounded — chains are short)
        head = rec
        for _ in range(32):
            if head.superseded_by is None:
                break
            nxt = await self.store.get(head.superseded_by)
            if nxt is None:
                break
            head = nxt
            if head.retired_at is None:
                break
        if head.retired_at is None and head.id != rec.id:
            topic = await self.store.get_topic(head.topic_id) if head.topic_id else None
            out["replacement"] = {
                "deposit_id": str(head.id), "claim": head.claim,
                "confidence": round(await self._confidence(head, topic, self.now()), 4),
                "sources": head.sources,
            }
        return out

    async def recalls(self, since: datetime) -> list[RecallItem]:
        """The correction-propagation feed: every retirement since `since`, so an
        agent that cached an answer OUTSIDE rrsrch can poll and self-correct."""
        return await self.store.recalls(since)

    # ------------------------------------------------------------- internals

    async def _trust(self, depositor: str) -> float:
        """Track-record trust — a pure function of independently recorded
        corroboration outcomes, over an attestation-shifted prior (Phase 3).
        Never an LLM. Unattested ⇒ the prior is untouched ⇒ exact Phase 2."""
        agreed, contradicted = await self.store.depositor_counts(depositor)
        level = await self.store.attested_level(depositor)
        prior = self.settings.trust_prior_mean
        if level is not None:
            prior = conf.attested_prior(prior, self.settings.attested_prior_ceiling,
                                        level)
        return conf.trust_score(agreed, contradicted, prior,
                                self.settings.trust_prior_strength)

    async def _depositor_base(self, depositor: str) -> float:
        return conf.trust_base(await self._trust(depositor),
                               self.settings.trust_prior_mean,
                               self.settings.trust_base_at_prior,
                               self.settings.trust_sub_slope)

    async def _bump_trust(self, depositor: str, *, agreed: int = 0,
                          contradicted: int = 0) -> None:
        a, c = await self.store.depositor_counts(depositor)
        level = await self.store.attested_level(depositor)
        prior = self.settings.trust_prior_mean
        if level is not None:
            prior = conf.attested_prior(prior, self.settings.attested_prior_ceiling,
                                        level)
        score = conf.trust_score(a + agreed, c + contradicted, prior,
                                 self.settings.trust_prior_strength)
        await self.store.bump_depositor(depositor, agreed=agreed,
                                        contradicted=contradicted, score=score)

    async def _verify_attestation(self, token: str | None, depositor: str) -> bool:
        """Deterministic: a valid, unexpired, PRESENTER-BOUND token records the
        depositor's verified level; anything else is silently unattested."""
        res = self.attestor.verify(token, depositor, self.now())
        if res.verified:
            await self.store.set_attested_level(depositor, res.level)
        return res.verified

    async def _confidence(self, rec: DepositRecord, topic: TopicState | None,
                          now: datetime) -> float:
        # Observed volatility (evidence) overrides the depositor's hint; the topic's
        # half_life_factor applies the bandit's settled/volatile adjustment; the
        # depositor's CURRENT trust sets the base — an independently vouched
        # deposit serves at full base regardless of its author's standing.
        vol = (topic.observed_volatility if topic else None) or rec.volatility
        factor = topic.half_life_factor if topic else 1.0
        base = (1.0 if rec.independent_corroboration_count > 0
                else await self._depositor_base(rec.depositor))
        return conf.confidence(rec.created_at, rec.last_corroborated_at, now,
                               vol, self._half_lives, half_life_factor=factor,
                               base=base)

    async def _no_serve(self, query, outcome, reason, cold, *, sim=None, c=None,
                        dep_id=None, volatility=None, topic_id=None,
                        detail=None) -> SearchResult:
        await self._log(query, outcome, reason, sim=sim, c=c, saved=0, spent=cold,
                        dep_id=dep_id, volatility=volatility, topic_id=topic_id,
                        detail=detail)
        return SearchResult(serve=False, outcome=outcome, reason=reason,
                            similarity=round(sim, 4) if sim is not None else None,
                            confidence=round(c, 4) if c is not None else None,
                            deposit_id=dep_id)

    async def _log(self, query, outcome, reason, *, sim, c, saved, spent, dep_id,
                   volatility, topic_id=None, detail=None) -> None:
        await self.store.log_event({
            "ts": self.now().isoformat(), "query": query, "outcome": outcome, "reason": reason,
            "similarity": sim, "confidence": c, "tokens_saved_estimate": saved,
            "tokens_spent_estimate": spent, "served_deposit_id": dep_id, "volatility": volatility,
            "topic_id": topic_id, "detail": detail,
        })

    async def _log_corroboration(self, rec: DepositRecord, outcome: str,
                                 v: agreement.Verdict, topic: TopicState | None,
                                 ttc: float | None = None,
                                 independent: bool = False) -> None:
        detail: dict[str, Any] = {"rule": v.rule, "fields": v.detail,
                                  "independent": independent,
                                  "author": rec.depositor,
                                  "author_trust": round(await self._trust(rec.depositor), 4),
                                  "author_attested_level":
                                      await self.store.attested_level(rec.depositor)}
        if topic is not None:
            detail["exploration_rate"] = round(topic.exploration_rate, 6)
            detail["half_life_factor"] = round(topic.half_life_factor, 4)
        if ttc is not None:
            detail["time_to_correction_seconds"] = round(ttc, 1)
        await self.store.log_event({
            "ts": self.now().isoformat(), "query": rec.query, "outcome": outcome,
            "reason": v.rule, "similarity": round(v.lexical, 4), "confidence": None,
            "tokens_saved_estimate": 0, "tokens_spent_estimate": 0,
            "served_deposit_id": str(rec.id), "volatility": rec.volatility,
            "topic_id": rec.topic_id, "detail": detail,
        })

    async def recent(self, limit: int = 30) -> list[dict[str, Any]]:
        """Read-only observability feed (the dashboard's reuse stream): the last
        `limit` query events newest-first, with served rows (hit/stale) enriched
        from the deposit they point at — claim (truncated), source urls,
        depositor, and the deposit's age at serve time. Never touches the
        matching/confidence/trust path."""
        events = await self.store.recent_events(limit)
        deposits: dict[str, DepositRecord | None] = {}
        for e in events:
            dep_id = e.get("served_deposit_id")
            if not dep_id or e["outcome"] not in ("hit", "stale"):
                continue
            if dep_id not in deposits:
                deposits[dep_id] = await self.store.get(UUID(dep_id))
            rec = deposits[dep_id]
            if rec is None:
                continue
            e["claim"] = rec.claim[:240] + ("…" if len(rec.claim) > 240 else "")
            e["source_urls"] = [u for s in rec.sources if (u := s.get("url"))][:5]
            e["depositor"] = rec.depositor
            if e.get("ts"):
                served_at = datetime.fromisoformat(e["ts"])
                e["age_seconds"] = round((served_at - rec.created_at).total_seconds(), 1)
        return events

    async def metrics(self) -> dict[str, Any]:
        stats = await self.store.event_stats()
        topic_states = {
            t.topic_id: {
                "exploration_rate": round(t.exploration_rate, 6),
                "half_life_factor": round(t.half_life_factor, 4),
                "agreement_count": t.agreement_count,
                "disagreement_count": t.disagreement_count,
                "observed_volatility": t.observed_volatility,
                "base_volatility": t.base_volatility,
                "last_verified_at": t.last_verified_at.isoformat() if t.last_verified_at else None,
            }
            for t in await self.store.list_topics()
        }
        m = telemetry.metrics(stats, self.settings.cold_path_estimate_tokens,
                              topic_states=topic_states)
        # plain read-only counts for the dashboard tiles — no new metrics math
        m["corpus"] = await self.store.corpus_stats()
        return m
