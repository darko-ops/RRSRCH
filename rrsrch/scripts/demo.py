#!/usr/bin/env python3
"""Runs the three worked examples and prints the savings report.

Uses the offline pair (in-memory store + hash embedder) so it runs anywhere with
no Postgres and no model download. Production wiring is identical via build_corpus()
with RRSRCH_STORE=postgres and RRSRCH_EMBEDDER=local.

    PYTHONPATH=src python scripts/demo.py
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone

from rrsrch.config import Settings
from rrsrch.corpus import Corpus
from rrsrch.embedder import HashEmbedder
from rrsrch.schemas import DepositIn
from rrsrch.store import InMemoryCorpusStore


class Clock:
    def __init__(self) -> None:
        self.t = datetime(2026, 1, 1, tzinfo=timezone.utc)

    def __call__(self) -> datetime:
        return self.t


def line(s: str = "") -> None:
    print(s)


async def main() -> None:
    clk = Clock()
    settings = Settings(store="memory", embedder="hash", similarity_floor=0.6,
                        agreement_floor=0.9, cold_path_estimate_tokens=90_000)
    corpus = Corpus(InMemoryCorpusStore(), HashEmbedder(384), settings, now=clk)

    line("=" * 68)
    line("rrsrch Phase 0 — worked examples (offline: in-memory + hash embedder)")
    line("=" * 68)

    # A — cold miss, then deposit
    line("\n[A] COLD MISS")
    q = "CMMC Level 2 assessment requirements"
    r = await corpus.search(q)
    line(f"  search({q!r}) -> {r.outcome}  ({r.advice})")
    dep = await corpus.deposit(DepositIn(
        query=q, claim="CMMC Level 2 aligns to NIST SP 800-171's 110 controls; assessed by a C3PAO.",
        sources=[{"url": "https://dodcio.defense.gov/cmmc"}], volatility_hint="low"))
    line(f"  deposit -> id={str(dep.id)[:8]}  base_confidence={dep.base_confidence}  volatility={dep.volatility}")

    # B — warm hit (3 days later, paraphrase)
    line("\n[B] WARM HIT (3 days later, paraphrased query)")
    clk.t += timedelta(days=3)
    r = await corpus.search("what does CMMC level 2 require for assessment?")
    line(f"  outcome={r.outcome}  confidence={r.confidence}  similarity={r.similarity}")
    line(f"  claim: {r.claim}")

    # C — stale correction
    line("\n[C] STALE ANSWER, CAUGHT AND CORRECTED")
    qs = "current S3 Standard price per GB"
    await corpus.deposit(DepositIn(query=qs, claim="S3 Standard is $0.023 per GB / month.",
                                   volatility_hint="high"))
    clk.t += timedelta(days=60)
    r = await corpus.search(qs)
    line(f"  search after 60d -> {r.outcome}  confidence={r.confidence}  ({r.advice})")
    res = await corpus.corroborate(qs, "Prices rose; S3 Standard is now about three cents per gigabyte monthly.")
    line(f"  corroborate(fresh) -> {res['result']} (old retired, superseded)")
    r = await corpus.search(qs)
    line(f"  search again -> {r.outcome}  claim: {r.claim}")

    # Savings report
    line("\n" + "=" * 68)
    line("SAVINGS REPORT")
    line("=" * 68)
    line(json.dumps(await corpus.savings_report(), indent=2))


if __name__ == "__main__":
    asyncio.run(main())
