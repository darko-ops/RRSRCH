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


@dataclass
class RunResult:
    s: float
    records: list[Record]
    engine_metrics: dict[str, Any]
    counts: dict[str, int] = field(default_factory=dict)


def _classify_serve(served: RegEntry, label: Label, truth: str) -> tuple[str, str | None]:
    if served.label == label:
        return ("true_hit", None) if served.claim == truth else ("outdated_serve", None)
    if served.label.intent_id == label.intent_id:
        cause = "scope" if served.label.scope_key != label.scope_key else "polarity"
    else:
        cause = "wrong_intent"
    return "false_hit", cause


async def run_stream(queries: list[Query], settings: Settings) -> RunResult:
    if settings.store == "postgres":
        from sqlalchemy import text
        from sqlalchemy.ext.asyncio import create_async_engine

        eng = create_async_engine(settings.database_url)
        async with eng.begin() as conn:
            await conn.execute(text("TRUNCATE deposits, query_events, topic_state"))
        await eng.dispose()

    clock = Clock()
    corpus = Corpus(build_store(settings), get_embedder(settings), settings, now=clock)
    registry: dict[str, RegEntry] = {}
    records: list[Record] = []
    n = len(queries)

    for idx, q in enumerate(queries):
        clock.t += timedelta(minutes=q.gap_minutes)
        truth = current_truth(q, idx / n)
        available = any(e.live and e.label == q.label and e.claim == truth
                        for e in registry.values())

        res = await corpus.search(q.text, scope=q.scope)
        served_claim = served_query = None
        if res.serve:
            served = registry[res.deposit_id]   # every deposit is harness-made
            classification, cause = _classify_serve(served, q.label, truth)
            served_claim = served.claim
            rec_row = await corpus.store.get(UUID(res.deposit_id))
            served_query = rec_row.query if rec_row else None
            # a production caller trusts a serve — no deposit happens
        else:
            classification = "lost_hit" if available else "correct_miss"
            cause = None
            # production behavior after a no-serve: re-derive, then either
            # corroborate the stale deposit (if it was OUR question) or deposit.
            stale_own = (res.outcome == "stale" and res.deposit_id in registry
                         and registry[res.deposit_id].label == q.label)
            if stale_own:
                out = await corpus.corroborate(res.deposit_id, truth)
                if out.outcome == "disagreed" and out.new_deposit_id:
                    registry[res.deposit_id].live = False
                    registry[out.new_deposit_id] = RegEntry(q.label, truth)
                elif out.outcome == "agreed":
                    registry[res.deposit_id].claim = truth
            else:
                rec = await corpus.deposit(DepositIn(
                    query=q.text, claim=truth, scope=q.scope,
                    volatility_hint=q.volatility))
                registry[str(rec.id)] = RegEntry(q.label, truth)

        records.append(Record(idx, q.kind, res.outcome, res.reason, classification,
                              cause, sum(1 for e in registry.values() if e.live),
                              q.text, served_query, served_claim))

    counts: dict[str, int] = {}
    for r in records:
        counts[r.classification] = counts.get(r.classification, 0) + 1
        if r.cause:
            counts[f"false_hit:{r.cause}"] = counts.get(f"false_hit:{r.cause}", 0) + 1
        if r.classification == "lost_hit":
            key = f"lost_hit:{r.reason or 'unknown'}"
            counts[key] = counts.get(key, 0) + 1
    return RunResult(0.0, records, await corpus.metrics(), counts)


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
