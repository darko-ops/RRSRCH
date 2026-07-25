#!/usr/bin/env python3
"""Threshold sweep on the captured Phase-A set — ZERO new derivations.

Reuses the cached answers from run 1 (organic.deposits, keyed by query). No
SearchProvider is constructed, so token spend is provably zero. Matching uses the
deposit's QUERY embedding (never the claim), so re-replaying at any threshold is
faithful even where we only hold a placeholder claim (the 15 queries that HIT in
run 1 and were never derived). Placeholder deposits are flagged.

Pass 1: replay the 44-query stream temporally (empty->grow) at each threshold,
record every hit (query, matched_deposit_query, sim), tag with the hand-adjudicated
run-1 label where the pair is known, else mark NEW (for LLM adjudication).
"""
from __future__ import annotations

import asyncio
import json
import os

import asyncpg

from rrsrch.config import Settings
from rrsrch.corpus import Corpus
from rrsrch.embeddings import get_embedder
from rrsrch.factory import build_store
from rrsrch.schemas import DepositIn, Source

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUN = os.path.join(HERE, "reports", "organic_run.json")
OUT = os.path.join(HERE, "reports", "sweep_raw.json")
THRESHOLDS = [0.525, 0.575, 0.60, 0.65, 0.70, 0.75, 0.80]

# The 15 hand-adjudicated pairs from run 1 (§5 of reports/organic.md), keyed by
# (query, matched_deposit_query). Reused verbatim — never re-labeled by machine.
HAND = {
    ("Do we need a C3PAO assessment or is a self-assessment enough?",
     "Do I need to undergo a Level 2 assessment with a C3PAO, or can I conduct a self-assessment?"): "TRUE",
    ("What Is the CMMC Required by the DoD?", "What is the purpose of CMMC?"): "TRUE",
    ("What are the penalties for CMMC non-compliance?",
     "What happens if we don't meet CMMC Compliance requirements?"): "TRUE",
    ("How long does the CMMC compliance process take?",
     "How long does a CMMC Level 2 assessment generally take?"): "TRUE",
    ("Why Is There a Need to Create the CMMC?", "What is the purpose of CMMC?"): "TRUE",
    ("What Is the Difference Between DFARS and CMMC?",
     "Why Is the DoD Switching from DFARS Compliance to CMMC?"): "TRUE",
    ("How Do You Get CMMC Certification?", "How do I get CMMC certified?"): "TRUE",
    ("When was CMMC introduced, and what's the current rollout timeline?",
     "When Was the CMMC Released?"): "PARTIAL",
    ("Do I need to be preparing for CMMC Level 3?",
     "What CMMC level does my business actually need?"): "PARTIAL",
    ("What Are the CMMC Requirements?",
     "What CMMC level does my business actually need?"): "PARTIAL",
    ("What's the deadline to get CMMC compliant?", "Who needs to comply with CMMC?"): "FALSE",
    ("What should we do now to prepare for CMMC compliance?",
     "Who needs to comply with CMMC?"): "FALSE",
    ("How long is my CMMC certification valid?", "How do I get CMMC certified?"): "FALSE",
    ("What is a CUI enclave?", "What is CUI?"): "FALSE",
    ("How Long Is the Validity of CMMC Certification?", "How do I get CMMC certified?"): "FALSE",
}


async def main() -> None:
    rows = json.load(open(RUN))["rows"]
    stream = [(r["arrival_index"], r["query"], r["classifier_label"]) for r in rows]

    settings = Settings()
    dsn = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(dsn)
    cached = {r["query"]: (r["claim"], r["sources"])
              for r in await conn.fetch("select query, claim, sources from deposits")}
    print(f"cached answers reused: {len(cached)} (ZERO new derivations)")

    # embedder + store built ONCE; NO provider constructed -> no token spend possible.
    embedder = get_embedder(settings)
    sweep: dict[str, dict] = {}
    new_pairs: set[tuple[str, str]] = set()

    for T in THRESHOLDS:
        await conn.execute("TRUNCATE deposits, query_events, topic_state, depositor_trust;")
        s = Settings(similarity_threshold=T)
        corpus = Corpus(build_store(s), embedder, s, provider=None)
        hits, served, placeholders = [], 0, 0
        for idx, q, label in stream:
            res = await corpus.search(q)
            if res.serve:
                served += 1
                # matched query: fetch from the deposit we serve
                mq = await conn.fetchval("select query from deposits where id=$1",
                                         __import__("uuid").UUID(res.deposit_id))
                lab = HAND.get((q, mq))
                if lab is None:
                    new_pairs.add((q, mq))
                hits.append({"arrival_index": idx, "query": q, "matched_query": mq,
                             "similarity": round(res.similarity, 4),
                             "label": lab, "label_source": "hand" if lab else "NEW"})
            else:
                claim, srcs = cached.get(q, (None, None))
                if claim is None:
                    claim, srcs = f"[PLACEHOLDER — {q} never derived in run 1]", "[]"
                    placeholders += 1
                await corpus.deposit(DepositIn(
                    query=q, claim=claim,
                    sources=[Source(**x) for x in json.loads(srcs) if x.get("url")]
                    if isinstance(srcs, str) else [Source(**x) for x in (srcs or []) if x.get("url")],
                    volatility_hint="low", depositor="organic"))
        sweep[str(T)] = {"served": served, "placeholder_deposits": placeholders, "hits": hits}
        print(f"T={T}: served={served} placeholders={placeholders}")

    json.dump({"sweep": sweep, "new_pairs": sorted(new_pairs)}, open(OUT, "w"), indent=2)
    await conn.close()
    print(f"\nNEW pairs needing LLM adjudication: {len(new_pairs)}")
    for q, mq in sorted(new_pairs):
        print(f"  Q: {q}\n  M: {mq}\n")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
