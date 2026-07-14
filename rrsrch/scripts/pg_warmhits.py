#!/usr/bin/env python3
"""Drive real deposit->reworded-search warm hits against the SAME Postgres the
/metrics server reads. Uses build_corpus() so store/embedder come from env
(RRSRCH_STORE=postgres, RRSRCH_EMBEDDER=local, threshold 0.525). Not the
memory-only scripts/demo.py."""
from __future__ import annotations

import asyncio

from rrsrch.config import Settings
from rrsrch.factory import build_corpus
from rrsrch.schemas import DepositIn, Source


async def main() -> None:
    s = Settings()
    print(f"store={s.store}  embedder={s.embedder}  threshold={s.similarity_threshold}")
    print(f"db={s.database_url}\n")
    corpus = build_corpus(s)

    # 1) deposit the expensively-researched CMMC answer
    rec = await corpus.deposit(DepositIn(
        query="What are the CMMC Level 2 assessment requirements?",
        claim=("CMMC L2 requires meeting all 110 NIST 800-171 controls, assessed by a "
               "C3PAO (Certified Third-Party Assessment Organization) via a triennial "
               "certification assessment, with annual affirmations of continued compliance."),
        volatility_hint="low",
        sources=[Source(url="https://dodcio.defense.gov/CMMC/")]))
    print(f"deposited {rec.id}  (volatility={rec.volatility})\n")

    # 2) reworded searches -> should serve the cached claim (warm hits)
    paraphrases = [
        "what does CMMC level 2 require for assessment?",
        "CMMC Level 2 assessment: what's needed to pass?",
        "requirements to get assessed at CMMC level 2",
    ]
    for q in paraphrases:
        r = (await corpus.search(q)).model_dump(exclude_none=True)
        print(f"search: {q!r}")
        print(f"   -> serve={r.get('serve')} outcome={r.get('outcome')} "
              f"similarity={r.get('similarity')} confidence={r.get('confidence')}")


if __name__ == "__main__":
    asyncio.run(main())
