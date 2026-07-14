#!/usr/bin/env python3
"""Facet-gate A/B on the captured Phase-A stream — ZERO new derivations.

Re-replays the 44-query stream temporally (empty->grow) reusing run-1 cached
answers, once with the facet gate ON and once OFF (facet extraction neutralized),
at thresholds 0.525 and 0.60. No SearchProvider is constructed. Reuses the
hand-adjudicated run-1 labels + the LLM-labeled sweep pairs; any brand-new pair is
printed for adjudication (never silently scored).
"""
from __future__ import annotations

import asyncio
import json
import os
from itertools import product

import asyncpg

import rrsrch.agreement as ag
from rrsrch.config import Settings
from rrsrch.corpus import Corpus
from rrsrch.embeddings import get_embedder
from rrsrch.factory import build_store
from rrsrch.schemas import DepositIn, Source

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUN = os.path.join(HERE, "reports", "organic_run.json")
_REAL_FACET = ag._extract_facet

# hand-adjudicated (run 1) + LLM-labeled (sweep) — keyed (query, matched_query).
LABELS = {
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
    ("How Long Is the Validity of CMMC Certification?",
     "How long does the CMMC compliance process take?"): "FALSE",
    ("How much does CMMC compliance cost?",
     "How long does the CMMC compliance process take?"): "FALSE",
    ("What Are the CMMC Requirements?", "What Is the CMMC Required by the DoD?"): "FALSE",
    ("What's the deadline to get CMMC compliant?",
     "How long does the CMMC compliance process take?"): "FALSE",
    ("How Long Is the Validity of CMMC Certification?",
     "How long is my CMMC certification valid?"): "TRUE",  # placeholder-content (flagged)
    # NEW pairs the facet gate REROUTED into (LLM-labeled; flagged in report).
    # All same-facet-different-subject or densification false hits — the residual
    # class the facet gate cannot fix (needs a subject/entity axis).
    ("How long is my CMMC certification valid?",
     "How long does a CMMC Level 2 assessment generally take?"): "FALSE",
    ("How Long Is the Validity of CMMC Certification?",
     "How long does a CMMC Level 2 assessment generally take?"): "FALSE",
    ("What Are the CMMC Requirements?",
     "What's the deadline to get CMMC compliant?"): "FALSE",
}


async def replay(conn, stream, cache, embedder, T, gate_on):
    ag._extract_facet = _REAL_FACET if gate_on else (lambda _t: None)
    await conn.execute("TRUNCATE deposits, query_events, topic_state, depositor_trust;")
    s = Settings(similarity_threshold=T)
    corpus = Corpus(build_store(s), embedder, s, provider=None)
    hits, unknown = [], []
    for _idx, q in stream:
        res = await corpus.search(q)
        if res.serve:
            mq = await conn.fetchval("select query from deposits where id=$1",
                                     __import__("uuid").UUID(res.deposit_id))
            lab = LABELS.get((q, mq))
            if lab is None:
                unknown.append((q, mq))
            hits.append({"q": q, "mq": mq, "sim": round(res.similarity, 4), "label": lab})
        else:
            claim, srcs = cache.get(q, (f"[PLACEHOLDER {q}]", []))
            await corpus.deposit(DepositIn(
                query=q, claim=claim,
                sources=[Source(**x) for x in srcs if x.get("url")],
                volatility_hint="low", depositor="organic"))
    return hits, unknown


def tally(hits):
    labs = [h["label"] for h in hits]
    t, p, f = labs.count("TRUE"), labs.count("PARTIAL"), labs.count("FALSE")
    n = len(hits)
    return {"served": n, "true": t, "partial": p, "false": f,
            "precision_strict": round(t / n, 3) if n else None,
            "tp_rate": round(t / 44, 3), "false_hit_rate": round(f / n, 3) if n else None}


async def main():
    stream = [(r["arrival_index"], r["query"]) for r in json.load(open(RUN))["rows"]]
    settings = Settings()
    dsn = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(dsn)
    cache = {r["query"]: (r["claim"], json.loads(r["sources"]) if isinstance(r["sources"], str)
                          else (r["sources"] or []))
             for r in await conn.fetch("select query, claim, sources from deposits")}
    embedder = get_embedder(settings)
    print(f"cached answers reused: {len(cache)} (ZERO derivations)\n")

    results, all_unknown = {}, []
    for gate_on, T in product([False, True], [0.525, 0.60]):
        hits, unknown = await replay(conn, stream, cache, embedder, T, gate_on)
        key = f"{'ON ' if gate_on else 'OFF'}@{T}"
        results[key] = {"tally": tally(hits), "hits": hits}
        all_unknown += unknown
        print(f"{key}: {tally(hits)}")
    ag._extract_facet = _REAL_FACET
    await conn.close()

    json.dump(results, open(os.path.join(HERE, "reports", "facet_sweep.json"), "w"), indent=2)
    uniq = sorted(set(all_unknown))
    print(f"\nUNKNOWN pairs (need adjudication): {len(uniq)}")
    for q, mq in uniq:
        print(f"  Q: {q}\n  M: {mq}\n")


if __name__ == "__main__":
    asyncio.run(main())
