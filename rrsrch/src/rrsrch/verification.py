"""Self-verification — rrsrch checks ITSELF, no agent and no human in the loop.

=============================================================================
THE INVIOLABLE RULE: which topic gets verified, and what the corroboration
verdict is, are DETERMINISTIC code (priority = age_since_verified ×
exploration_rate; verdict = agreement.py). A SearchProvider MAY use an LLM to
derive a fresh claim — that is the fuzzy, recoverable part — but the provider
never decides trust; it only supplies evidence that corroborate() judges.
=============================================================================

Single-process async — deliberately no Celery/Redis/queue (out of scope).
`verify_once()` is the unit tests drive; `verify_loop()` wraps it for prod
(`make verify-loop`). Providers are injectable so tests never hit the live web.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Protocol

from . import exploration
from .corpus import Corpus
from .schemas import ResearchResult, TopicState


class SearchProvider(Protocol):
    """The 'fresh search' capability. Prod wires a real research pipeline (which
    may use an LLM to distill); tests inject a fake returning a known answer."""
    async def research(self, query: str, scope: dict[str, Any] | None) -> ResearchResult: ...


@dataclass
class VerifyReport:
    topic_id: str
    deposit_id: str
    outcome: str            # 'agreed' | 'disagreed' | 'skipped_no_live_deposit'
    priority: float
    tokens_spent: int


class Verifier:
    def __init__(self, corpus: Corpus, provider: SearchProvider) -> None:
        self.corpus = corpus
        self.provider = provider

    async def verify_once(self, batch_size: int | None = None) -> list[VerifyReport]:
        """One deterministic pass: rank all topics by (age since last_verified_at ×
        exploration_rate), verify the top N. A topic whose last disagreement reset
        last_verified_at to None ranks first — that is the immediate-re-verify
        trigger, with no randomness involved."""
        now = self.corpus.now()
        n = batch_size or self.corpus.settings.verify_batch_size

        def priority(t: TopicState) -> float:
            anchor = t.last_verified_at or t.created_at
            age = (now - anchor).total_seconds() if anchor else float(365 * 86400)
            if t.last_verified_at is None:
                age = max(age, float(365 * 86400))   # never/reset ⇒ front of the queue
            return exploration.verification_priority(age, t.exploration_rate)

        ranked = sorted(((priority(t), t) for t in await self.corpus.store.list_topics()),
                        key=lambda pt: (-pt[0], pt[1].topic_id))
        reports: list[VerifyReport] = []
        for prio, topic in ranked[:n]:
            reports.append(await self._verify_topic(topic, prio))
        return reports

    async def _verify_topic(self, topic: TopicState, prio: float) -> VerifyReport:
        rec = await self.corpus.store.latest_live_deposit(topic.topic_id)
        if rec is None:
            return VerifyReport(topic.topic_id, "", "skipped_no_live_deposit", prio, 0)
        research = await self.provider.research(rec.query, rec.scope)
        spend = research.tokens_spent or self.corpus.settings.cold_path_estimate_tokens
        await self.corpus.store.log_event({
            "ts": self.corpus.now().isoformat(), "query": rec.query, "outcome": "explore",
            "reason": "verifier", "similarity": None, "confidence": None,
            "tokens_saved_estimate": 0, "tokens_spent_estimate": spend,
            "served_deposit_id": str(rec.id), "volatility": rec.volatility,
            "topic_id": topic.topic_id, "detail": {"trigger": "verifier"},
        })
        out = await self.corpus.corroborate(str(rec.id), research.claim,
                                            sources=research.sources,
                                            depositor="rrsrch-verifier")
        # stamp the visit (corroborate may have reset last_verified_at on disagree —
        # the NEW deposit was just verified-by-construction, so stamp anyway; the
        # next disagreement will reset it again).
        fresh = await self.corpus.store.get_topic(topic.topic_id)
        if fresh is not None:
            fresh.last_verified_at = self.corpus.now()
            await self.corpus.store.upsert_topic(fresh)
        return VerifyReport(topic.topic_id, str(rec.id), out.outcome, prio, spend)

    async def verify_loop(self, interval_seconds: float | None = None) -> None:
        """Run forever (prod). Ctrl-C to stop; `make verify-loop`."""
        interval = interval_seconds or self.corpus.settings.verify_interval_seconds
        while True:  # pragma: no cover - the loop shell; verify_once is tested
            reports = await self.verify_once()
            for r in reports:
                print(f"[verify] topic={r.topic_id} deposit={r.deposit_id} "
                      f"outcome={r.outcome} priority={r.priority:.0f}")
            await asyncio.sleep(interval)


def main() -> None:  # pragma: no cover - prod entrypoint (env-gated live provider)
    import argparse

    from .config import Settings
    from .factory import build_corpus
    from .providers import build_provider

    parser = argparse.ArgumentParser(description="rrsrch self-verification worker")
    parser.add_argument("--once", action="store_true", help="one verify pass, then exit")
    args = parser.parse_args()

    settings = Settings()
    provider = build_provider(settings)   # raises loudly when unconfigured
    corpus = build_corpus(settings)
    corpus.provider = provider            # inline search-exploration uses it too
    verifier = Verifier(corpus, provider)

    async def _run() -> None:
        if args.once:
            for r in await verifier.verify_once():
                print(f"[verify] topic={r.topic_id} deposit={r.deposit_id} "
                      f"outcome={r.outcome} priority={r.priority:.0f} spent={r.tokens_spent}")
        else:
            await verifier.verify_loop()

    asyncio.run(_run())
