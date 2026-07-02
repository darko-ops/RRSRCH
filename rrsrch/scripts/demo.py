#!/usr/bin/env python3
"""Walk the three worked examples against a live corpus and print the savings
report. Offline by default (in-memory store + hash embedder, simulated clock);
run with RRSRCH_EMBEDDER=local for the production model.

    PYTHONPATH=src python scripts/demo.py
"""
from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timedelta, timezone

from rrsrch.config import Settings
from rrsrch.corpus import Corpus
from rrsrch.embeddings import get_embedder
from rrsrch.schemas import DepositIn, Source
from rrsrch.store.memory import InMemoryStore


class Clock:
    def __init__(self) -> None:
        self.t = datetime(2026, 1, 1, tzinfo=timezone.utc)

    def __call__(self) -> datetime:
        return self.t


def show(title: str, payload: object) -> None:
    print(f"\n--- {title}")
    print(json.dumps(payload, indent=2, default=str))


async def main() -> None:
    settings = Settings(
        store="memory",
        embedder=os.environ.get("RRSRCH_EMBEDDER", "hash"),
        similarity_threshold=float(os.environ.get("RRSRCH_SIMILARITY_THRESHOLD", "0.55")),
    )
    clock = Clock()
    corpus = Corpus(InMemoryStore(), get_embedder(settings), settings, now=clock)

    print("=" * 64)
    print("A) COLD MISS — nobody has asked this yet")
    print("=" * 64)
    q = "CMMC Level 2 assessment requirements"
    show("search(q)", (await corpus.search(q)).model_dump(exclude_none=True))
    print("→ agent does the expensive research once, then deposits the distilled claim:")
    rec = await corpus.deposit(DepositIn(
        query=q,
        claim=("CMMC Level 2 requires the 110 NIST SP 800-171 controls and, for most "
               "contractors, a triennial C3PAO assessment."),
        volatility_hint="low",
        sources=[Source(url="https://dodcio.defense.gov/cmmc/")]))
    print(f"deposited {rec.id}")

    print("\n" + "=" * 64)
    print("B) WARM HIT — 3 (simulated) days later, a PARAPHRASE")
    print("=" * 64)
    clock.t += timedelta(days=3)
    show("search(paraphrase)",
         (await corpus.search("what does CMMC level 2 require for assessment?"))
         .model_dump(exclude_none=True))
    print("→ served from the corpus: no re-derivation, tiny token cost.")

    print("\n" + "=" * 64)
    print("C) STALE CORRECTION — fast-decaying claim, 60 days old")
    print("=" * 64)
    price_q = "current S3 Standard storage price per GB"
    old = await corpus.deposit(
        DepositIn(query=price_q, claim="$0.023 per GB-month", volatility_hint="high",
                  scope={"region": "us-east-1"}),
        created_at=clock.t - timedelta(days=60))
    stale = await corpus.search(price_q, scope={"region": "us-east-1"})
    show("search(price) → stale", stale.model_dump(exclude_none=True))
    fixed = await corpus.corroborate(
        str(old.id), "$0.021 per GB-month (reduced January 2026)",
        sources=[Source(url="https://aws.amazon.com/s3/pricing/")])
    show("corroborate(fresh finding) → disagreed, superseded", fixed.model_dump(exclude_none=True))
    show("search(price) again → the corrected claim",
         (await corpus.search(price_q, scope={"region": "us-east-1"})).model_dump(exclude_none=True))

    print("\n" + "=" * 64)
    print("SAVINGS REPORT (/metrics)")
    print("=" * 64)
    m = await corpus.metrics()
    show("metrics", m)
    print(f"\n→ {m['hits']}/{m['total_queries']} served from the corpus; "
          f"{m['total_tokens_saved']:,} tokens saved "
          f"({m['reduction_pct']}% cheaper than deriving every query cold).")


if __name__ == "__main__":
    asyncio.run(main())
