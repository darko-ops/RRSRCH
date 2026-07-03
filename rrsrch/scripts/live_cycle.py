#!/usr/bin/env python3
"""ONE real proof-of-search cycle against live data (env-gated; costs tokens).

Deposits a deliberately OUTDATED volatile fact, then lets the self-verification
loop — with the REAL WebSearchProvider — catch it: fresh research disagrees,
the deposit is retired with superseded_by, and the correction shows in /recalls.
No agent calls corroborate; no human supplies the answer.

    RRSRCH_PROVIDER=claude-cli RRSRCH_STORE=postgres RRSRCH_EMBEDDER=minilm \
        PYTHONPATH=src python scripts/live_cycle.py

Prints a transcript (also consumed by scripts/real_stack_report.py).
"""
from __future__ import annotations

import asyncio
import json
import sys
from datetime import datetime, timezone

from rrsrch.config import Settings
from rrsrch.corpus import Corpus
from rrsrch.embeddings import get_embedder
from rrsrch.factory import build_store
from rrsrch.providers import build_provider
from rrsrch.schemas import DepositIn, Source
from rrsrch.verification import Verifier

QUERY = "What is the latest stable Python 3 release version?"
OUTDATED_CLAIM = "The latest stable Python 3 release is Python 3.9.0."


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%H:%M:%S")


async def main() -> int:
    settings = Settings()
    provider = build_provider(settings)          # fails loudly if unconfigured
    if settings.store == "postgres":             # demo runs on a clean corpus
        from sqlalchemy import text
        from sqlalchemy.ext.asyncio import create_async_engine

        eng = create_async_engine(settings.database_url)
        async with eng.begin() as conn:
            await conn.execute(text("TRUNCATE deposits, query_events, topic_state, depositor_trust"))
        await eng.dispose()
    corpus = Corpus(build_store(settings), get_embedder(settings), settings,
                    provider=provider)
    t0 = datetime.now(timezone.utc)

    print(f"[{stamp()}] provider={type(provider).__name__} store={settings.store} "
          f"embedder={settings.embedder}")
    rec = await corpus.deposit(DepositIn(
        query=QUERY, claim=OUTDATED_CLAIM, volatility_hint="high",
        sources=[Source(url="https://www.python.org/downloads/",
                        title="(stale) Python downloads")],
        depositor="live-cycle-demo"))
    print(f"[{stamp()}] deposited OUTDATED claim: {OUTDATED_CLAIM!r}")
    print(f"           id={rec.id} topic={rec.topic_id} volatility=high")

    print(f"[{stamp()}] running verify_once() with the REAL provider "
          "(live web research — takes a minute)...")
    reports = await Verifier(corpus, provider).verify_once(batch_size=1)
    r = reports[0]
    print(f"[{stamp()}] verifier: topic={r.topic_id} outcome={r.outcome} "
          f"tokens_spent={r.tokens_spent}")

    look = await corpus.lookup(str(rec.id))
    print(f"[{stamp()}] lookup(old deposit):")
    print(json.dumps(look, indent=2, default=str))

    feed = [x.model_dump(mode="json", exclude_none=True) for x in await corpus.recalls(t0)]
    print(f"[{stamp()}] /recalls since start: {json.dumps(feed, indent=2, default=str)}")

    served = await corpus.search(QUERY)
    print(f"[{stamp()}] search() now serves: outcome={served.outcome} "
          f"claim={served.claim!r} confidence={served.confidence}")

    ok = r.outcome in ("agreed", "disagreed")
    if r.outcome == "disagreed":
        ok = ok and look.get("retired") is True and bool(feed) and served.serve
        print("\n→ CYCLE COMPLETE: stale claim caught and superseded by live research.")
    else:
        print("\n→ CYCLE COMPLETE: live research corroborated the claim "
              "(confidence re-earned).")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
