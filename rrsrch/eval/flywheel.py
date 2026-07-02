"""Flywheel harness: drive the REAL engine with labeled traffic and score every
outcome against ground truth.

The engine is entirely unmodified and label-blind: the harness calls the same
search()/deposit()/corroborate() production agents call, and keeps its OWN
registry deposit_id → (label, claim) on the side. Classification:

  TRUE HIT       served deposit matches (intent, scope, polarity) AND its claim
                 is the CURRENT truth
  OUTDATED SERVE label matches but the world has moved on (the claim is v1
                 after the truth changed) — the staleness signal
  FALSE HIT      served deposit differs on intent / scope / polarity — the
                 number that matters
  LOST HIT       not served although a live, current, label-matching deposit
                 existed (the matcher's real-world recall cost)
  CORRECT MISS   not served and no correct answer existed yet

Precision = true hits / served. Recall = true hits / queries with a correct
answer available. Hit rate alone would reward serving everything.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from rrsrch.config import Settings
from rrsrch.corpus import Corpus
from rrsrch.embeddings import get_embedder
from rrsrch.factory import build_store
from rrsrch.schemas import DepositIn

from eval.traffic import Label, Query, current_truth

T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)


class Clock:
    def __init__(self) -> None:
        self.t = T0

    def __call__(self) -> datetime:
        return self.t


@dataclass
class RegEntry:
    label: Label
    claim: str
    live: bool = True
    depositor: str = "local"


# --------------------------------------------------- agent profiles (Phase 2)
# What each profile's "research" yields. The engine never sees profiles — only
# depositor ids; trust must separate them from OUTCOMES alone.

def _corrupt(truth: str, salt: str) -> str:
    """A deterministic, materially wrong variant of the truth: numbers shifted
    far beyond tolerance, or polarity flipped — so the agreement gate can (and
    must) detect the contradiction. SALTED per agent: independent liars tell
    DIFFERENT lies. (An early unsalted version taught us the engine-level
    lesson the hard way: two agents wrong in exactly the same words cross-vouch
    each other's poison — track record can't tell consensus from collusion.
    Recorded in DECISIONS; coordinated collusion is Phase 3's problem.)"""
    k = 2 + sum(ord(ch) for ch in salt) % 5   # 2..6, per-agent
    m = re.search(r"\d+(?:\.\d+)?", truth)
    if m:
        wrong = round(float(m.group(0)) * k + k, 3)
        wrong_s = str(int(wrong)) if wrong == int(wrong) else str(wrong)
        return truth[:m.start()] + wrong_s + truth[m.end():]
    # number-free truths: a REALISTIC lie is different text, not the truth with a
    # negating prefix. (The prefix version taught us a real engine limitation:
    # "Not true: <already-negated truth>" carries matching boolean polarity and
    # near-identical text, so an honest corroboration AGREES with it and vouches
    # the poison — double-negation evasion. Recorded in DECISIONS.)
    return (f"Contrary to earlier guidance this was repealed in 20{20 + k} "
            f"and superseded by policy revision {k} ({salt} assessment).")


def derive_claim(agent: str, q: Query, truth: str) -> str:
    """The claim this agent's 'research' produces for this arrival."""
    profile = agent.split("-")[0]
    if profile == "malicious":
        return _corrupt(truth, agent)
    if profile == "dblneg":
        # the double-negation attacker: a sentential wrapper over the truth —
        # when the truth is itself negation-phrased this MEANS the opposite
        # while carrying the same document-level 'contains a negation' signal
        # and near-identical text (the exact bypass scoped polarity closes).
        return f"Not true: {truth}"
    if profile == "noisy" and q.misfire:
        stale = q.intent.answer if (q.intent and q.intent.answer_v2
                                    and truth != q.intent.answer) else None
        return stale or _corrupt(truth, agent)
    return truth


@dataclass
class Record:
    idx: int
    kind: str
    outcome: str               # hit | stale | miss
    reason: str | None
    classification: str        # true_hit | outdated_serve | false_hit | lost_hit | correct_miss
    cause: str | None          # false hits: scope | polarity | wrong_intent
    corpus_live: int
    query_text: str = ""
    served_query: str | None = None   # the deposit's canonical wording, if served
    served_claim: str | None = None
    agent: str = "local"              # who asked
    served_depositor: str | None = None   # who authored what was served


@dataclass
class RunResult:
    s: float
    records: list[Record]
    engine_metrics: dict[str, Any]
    counts: dict[str, int] = field(default_factory=dict)
    trust_curve: list[tuple[int, dict[str, float]]] = field(default_factory=list)
    deposits_by_agent: dict[str, int] = field(default_factory=dict)


def _classify_serve(served_label: Label, engine_claim: str, label: Label,
                    truth: str) -> tuple[str, str | None]:
    """Score against the claim the ENGINE actually stored/served — never the
    harness's own bookkeeping. (An `agreed` corroboration re-earns confidence
    but does NOT rewrite the stored claim; scoring the registry's idea of the
    claim would silently mask exactly the staleness bugs this harness exists
    to measure.)"""
    if served_label == label:
        return ("true_hit", None) if engine_claim == truth else ("outdated_serve", None)
    if served_label.intent_id == label.intent_id:
        cause = "scope" if served_label.scope_key != label.scope_key else "polarity"
    else:
        cause = "wrong_intent"
    return "false_hit", cause


async def run_stream(queries: list[Query], settings: Settings) -> RunResult:
    if settings.store == "postgres":
        from sqlalchemy import text
        from sqlalchemy.ext.asyncio import create_async_engine

        eng = create_async_engine(settings.database_url)
        async with eng.begin() as conn:
            await conn.execute(text("TRUNCATE deposits, query_events, topic_state, depositor_trust"))
        await eng.dispose()

    clock = Clock()
    corpus = Corpus(build_store(settings), get_embedder(settings), settings, now=clock)
    registry: dict[str, RegEntry] = {}
    records: list[Record] = []
    trust_curve: list[tuple[int, dict[str, float]]] = []
    deposits_by_agent: dict[str, int] = {}
    watch = sorted({q.agent for q in queries})
    n = len(queries)

    async def snapshot_trust(idx: int) -> None:
        from rrsrch import confidence as _conf
        snap = {}
        for agent in watch:
            a, c = await corpus.store.depositor_counts(agent)
            snap[agent] = round(_conf.trust_score(
                a, c, settings.trust_prior_mean, settings.trust_prior_strength), 4)
        trust_curve.append((idx, snap))

    # In production the self-verification loop patrols alongside agent traffic;
    # the multi-agent harness models it (it is also the designed lock-in
    # breaker: the verifier may penalize a young wrong claim regardless of its
    # author's current standing). The provider returns GROUND TRUTH — we are
    # testing trust dynamics here, not the provider.
    verifier = None
    if len(watch) > 1:
        from rrsrch.schemas import ResearchResult
        from rrsrch.verification import Verifier

        self_ref: dict[str, float] = {}   # closure cell for stream progress

        class TruthProvider:
            async def research(self, query: str, scope):
                stream_q = next((x for x in queries if x.text == query), None)
                claim = (current_truth(stream_q, self_ref.get("progress", 0.0))
                         if stream_q else "unknown")
                return ResearchResult(claim=claim, tokens_spent=1000)

        verifier = Verifier(corpus, TruthProvider())

    for idx, q in enumerate(queries):
        clock.t += timedelta(minutes=q.gap_minutes)
        truth = current_truth(q, idx / n)
        if verifier is not None:
            self_ref["progress"] = idx / n
            if (idx + 1) % 10 == 0:
                for rep in await verifier.verify_once(batch_size=3):
                    # keep the registry mirroring verifier-driven supersedes
                    if rep.outcome == "disagreed":
                        old = registry.get(rep.deposit_id)
                        if old is not None:
                            old.live = False
                            fresh = await corpus.store.latest_live_deposit(
                                (await corpus.store.get(UUID(rep.deposit_id))).topic_id)
                            if fresh is not None and str(fresh.id) not in registry:
                                registry[str(fresh.id)] = RegEntry(
                                    old.label, fresh.claim, depositor=fresh.depositor)
        available = any(e.live and e.label == q.label and e.claim == truth
                        for e in registry.values())

        res = await corpus.search(q.text, scope=q.scope)
        served_claim = served_query = None
        if res.serve:
            served = registry[res.deposit_id]   # every deposit is harness-made
            rec_row = await corpus.store.get(UUID(res.deposit_id))
            # authoritative: what the engine actually holds (and served)
            served_claim = rec_row.claim if rec_row else served.claim
            served_query = rec_row.query if rec_row else None
            classification, cause = _classify_serve(served.label, served_claim,
                                                    q.label, truth)
            # a production caller trusts a serve — no deposit happens
        else:
            classification = "lost_hit" if available else "correct_miss"
            cause = None
            # production behavior after a no-serve: the ASKING agent re-derives
            # (per its profile — reliable/noisy/malicious), then either
            # corroborates the stale deposit or deposits under its own name.
            derived = derive_claim(q.agent, q, truth)
            stale_own = (res.outcome == "stale" and res.deposit_id in registry
                         and registry[res.deposit_id].label == q.label)
            if stale_own:
                out = await corpus.corroborate(res.deposit_id, derived,
                                               depositor=q.agent)
                if out.outcome == "disagreed" and out.new_deposit_id:
                    registry[res.deposit_id].live = False
                    registry[out.new_deposit_id] = RegEntry(q.label, derived,
                                                            depositor=q.agent)
                # NOTE: on 'agreed' the engine keeps the OLD stored claim (it
                # only re-earns confidence + merges sources) — so the registry
                # claim must NOT be overwritten. The registry mirrors the
                # engine, always.
            else:
                rec = await corpus.deposit(DepositIn(
                    query=q.text, claim=derived, scope=q.scope,
                    volatility_hint=q.volatility, depositor=q.agent))
                registry[str(rec.id)] = RegEntry(q.label, derived, depositor=q.agent)
                deposits_by_agent[q.agent] = deposits_by_agent.get(q.agent, 0) + 1
                if q.agent.startswith("malicious"):
                    # the Sybil attempt: hammer one's own deposit — must gain nothing
                    for _ in range(2):
                        await corpus.corroborate(str(rec.id), derived,
                                                 depositor=q.agent)

        records.append(Record(idx, q.kind, res.outcome, res.reason, classification,
                              cause, sum(1 for e in registry.values() if e.live),
                              q.text, served_query, served_claim, q.agent,
                              registry[res.deposit_id].depositor
                              if res.serve and res.deposit_id in registry else None))
        if len(watch) > 1 and (idx + 1) % 25 == 0:
            await snapshot_trust(idx + 1)

    counts: dict[str, int] = {}
    for r in records:
        counts[r.classification] = counts.get(r.classification, 0) + 1
        if r.cause:
            counts[f"false_hit:{r.cause}"] = counts.get(f"false_hit:{r.cause}", 0) + 1
        if r.classification == "lost_hit":
            key = f"lost_hit:{r.reason or 'unknown'}"
            counts[key] = counts.get(key, 0) + 1
    return RunResult(0.0, records, await corpus.metrics(), counts,
                     trust_curve, deposits_by_agent)


# ------------------------------------------------------------- aggregation

def curve(records: list[Record], window: int = 50) -> list[tuple[int, float, int]]:
    """(query index, windowed true-hit rate, live corpus size) points."""
    pts = []
    for end in range(window, len(records) + 1, window // 2):
        chunk = records[end - window:end]
        rate = sum(1 for r in chunk if r.classification == "true_hit") / len(chunk)
        pts.append((end, rate, chunk[-1].corpus_live))
    return pts


def summarize(result: RunResult) -> dict[str, Any]:
    c = result.counts
    true_hits = c.get("true_hit", 0)
    served = true_hits + c.get("false_hit", 0) + c.get("outdated_serve", 0)
    available = true_hits + c.get("lost_hit", 0)   # correct answer existed
    return {
        "queries": len(result.records),
        "served": served,
        "true_hits": true_hits,
        "false_hits": c.get("false_hit", 0),
        "false_hit_breakdown": {k.split(":", 1)[1]: v for k, v in c.items()
                                if k.startswith("false_hit:")},
        "outdated_serves": c.get("outdated_serve", 0),
        "lost_hits": c.get("lost_hit", 0),
        "lost_hit_breakdown": {k.split(":", 1)[1]: v for k, v in c.items()
                               if k.startswith("lost_hit:")},
        "correct_misses": c.get("correct_miss", 0),
        "precision": round(true_hits / served, 4) if served else None,
        "recall": round(true_hits / available, 4) if available else None,
        "overall_true_hit_rate": round(true_hits / len(result.records), 4),
    }


def poison_stats(result: RunResult, prefix: str = "malicious") -> dict[str, Any]:
    """Containment, measured: how much of the malicious output ever reached a
    caller, and what the malicious agents' final standing is."""
    mal_deposits = sum(v for k, v in result.deposits_by_agent.items()
                       if k.startswith(prefix))
    served_records = [r for r in result.records
                      if r.served_depositor and r.served_depositor.startswith(prefix)]
    served_deposit_queries = {r.served_query for r in served_records}
    final_trust = dict(result.trust_curve[-1][1]) if result.trust_curve else {}
    return {
        "malicious_deposits": mal_deposits,
        "malicious_serves": len(served_records),
        "distinct_malicious_deposits_served": len(served_deposit_queries),
        "served_fraction": round(len(served_deposit_queries) / mal_deposits, 4)
        if mal_deposits else 0.0,
        "final_trust": final_trust,
    }
