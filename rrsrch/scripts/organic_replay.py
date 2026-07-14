#!/usr/bin/env python3
"""Phase A organic hit-rate harness (temporal, empty->growing, REAL derivations).

Sources ~independent CMMC questions from eval/organic_questions.json (verbatim,
taken as-they-come), replays them in a neutral round-robin arrival order against
an EMPTY Postgres corpus at MiniLM@0.525. On a HIT: record warm serve (measured
served tokens). On a MISS: run a REAL web+LLM derivation via providers.py
(claude-cli), record the ACTUAL tokens it spent (measured cold cost), and deposit
the real answer so LATER questions can organically hit it. No look-ahead: strictly
sequential. Every query is provenance-tagged into a captured_queries table.

Env: RRSRCH_STORE=postgres RRSRCH_EMBEDDER=local RRSRCH_PROVIDER=claude-cli
     RRSRCH_DATABASE_URL=...organic   (isolated empty DB)
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import itertools
from datetime import datetime, timezone

import asyncpg

from rrsrch.config import Settings
from rrsrch.corpus import Corpus
from rrsrch.embeddings import get_embedder
from rrsrch.factory import build_store
from rrsrch.providers import build_provider
from rrsrch.schemas import DepositIn
from rrsrch import telemetry

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QFILE = os.path.join(HERE, "eval", "organic_questions.json")
OUT = os.path.join(HERE, "reports", "organic_run.json")
MAX_Q = int(os.environ.get("ORGANIC_MAX_Q", "44"))

# --- classifier (measurement only; NOT a trust decision) --------------------
# shared-world  = answerable from public regulatory/vendor documentation.
# private-context = answerable only with a specific party's private/internal
#   state (a particular assessor's backlog, one vendor tool's account state).
# Deliberately generous toward shared-world for FAQ traffic; hand-audited in
# the report. Log the label + the signal that fired.
_PRIVATE_SIGNALS = [
    (r"\byour backlog\b", "asks a specific assessor's private backlog"),
    (r"\bin exostar\b|update it in \w+", "asks about one vendor tool's account state"),
]


def classify(q: str) -> tuple[str, str | None]:
    ql = q.lower()
    for pat, why in _PRIVATE_SIGNALS:
        if re.search(pat, ql):
            return "private-context", why
    return "shared-world", None


def interleave(sources: list[dict]) -> list[tuple[str, str, str]]:
    lists = [[(s["origin"], s["url"], q) for q in s["questions"]] for s in sources]
    out: list[tuple[str, str, str]] = []
    for row in itertools.zip_longest(*lists):
        out.extend(x for x in row if x is not None)
    return out


async def ensure_capture_table(dsn: str) -> asyncpg.Connection:
    conn = await asyncpg.connect(dsn)
    # Guarantee an EMPTY corpus at start -> temporal soundness (a query may only
    # hit deposits that arrived earlier IN THIS RUN). Survives prior smoke runs.
    await conn.execute("TRUNCATE deposits, query_events, topic_state, depositor_trust;")
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS captured_queries (
            arrival_index int, ts timestamptz, query text,
            source_origin text, source_url text, independently_sourced bool,
            classifier_label text, classifier_signal text,
            outcome text, similarity double precision,
            matched_deposit_id text, matched_deposit_query text,
            warm_serve_tokens int, tokens_spent_on_derivation int
        );""")
    await conn.execute("TRUNCATE captured_queries;")
    return conn


async def main() -> None:
    with open(QFILE) as f:
        data = json.load(f)
    questions = interleave(data["sources"])[:MAX_Q]

    settings = Settings()  # store=postgres, embedder=local, threshold=0.525 from env/defaults
    print(f"store={settings.store} embedder={settings.embedder} "
          f"threshold={settings.similarity_threshold} provider={settings.provider}")
    print(f"db={settings.database_url}")
    print(f"questions={len(questions)} (of {sum(len(s['questions']) for s in data['sources'])} sourced)\n")

    # Corpus WITHOUT a provider -> search() never auto-explores (hits are pure warm
    # serves). We drive real derivations ourselves on misses, so cold cost is clean.
    corpus = Corpus(build_store(settings), get_embedder(settings), settings, provider=None)
    provider = build_provider(settings)  # WebSearchProvider (claude-cli)

    dsn = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    conn = await ensure_capture_table(dsn)

    deposits: dict[str, dict] = {}   # id -> {query, claim, tokens_spent}
    curve: list[dict] = []
    rows: list[dict] = []
    hits = 0
    cum_saved = 0
    cum_cold = 0

    for i, (origin, url, q) in enumerate(questions, 1):
        label, signal = classify(q)
        res = await corpus.search(q)
        warm = matched = matched_q = None
        deriv_tokens = 0
        saved = 0
        if res.serve:
            hits += 1
            outcome = "hit"
            matched = res.deposit_id
            m = deposits.get(matched, {})
            matched_q = m.get("query")
            warm = telemetry.estimate_tokens(res.claim) + telemetry.estimate_tokens(
                json.dumps([s.model_dump(mode="json") for s in res.sources]))
            cold_for_match = m.get("tokens_spent") or 0
            saved = max(0, cold_for_match - warm)
            cum_saved += saved
            print(f"[{i:>2}/{len(questions)}] HIT  sim={res.similarity} "
                  f"q={q[:52]!r}\n           <- {str(matched_q)[:60]!r} "
                  f"(saved {saved} tok: {cold_for_match} cold -> {warm} warm)")
        else:
            outcome = res.outcome  # miss / stale
            try:
                research = await provider.research(q, None)
                deriv_tokens = research.tokens_spent
                cum_cold += deriv_tokens
                rec = await corpus.deposit(DepositIn(
                    query=q, claim=research.claim, sources=research.sources,
                    volatility_hint="low", depositor="organic"))
                deposits[str(rec.id)] = {"query": q, "claim": research.claim,
                                         "tokens_spent": deriv_tokens}
                print(f"[{i:>2}/{len(questions)}] {outcome.upper():<4} -> derived "
                      f"({deriv_tokens} tok) + deposited  q={q[:52]!r}")
            except Exception as e:  # one bad derivation must not kill the run
                outcome = "derivation_failed"
                print(f"[{i:>2}/{len(questions)}] MISS -> DERIVATION FAILED: {str(e)[:120]}")

        rows.append({
            "arrival_index": i, "query": q, "source_origin": origin, "source_url": url,
            "independently_sourced": True, "classifier_label": label,
            "classifier_signal": signal, "outcome": outcome,
            "similarity": res.similarity, "matched_deposit_id": matched,
            "matched_deposit_query": matched_q, "warm_serve_tokens": warm,
            "tokens_spent_on_derivation": deriv_tokens,
        })
        await conn.execute(
            """INSERT INTO captured_queries VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)""",
            i, datetime.now(timezone.utc), q, origin, url, True, label, signal,
            outcome, res.similarity, matched, matched_q, warm, deriv_tokens)
        curve.append({"i": i, "corpus_size": len(deposits), "cum_hits": hits,
                      "hit_rate": round(hits / i, 4)})

    await conn.close()

    sw = [r for r in rows if r["classifier_label"] == "shared-world"]
    sw_hits = [r for r in sw if r["outcome"] == "hit"]
    result = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total": len(rows), "hits": hits, "overall_hit_rate": round(hits / len(rows), 4),
        "shared_world_total": len(sw), "shared_world_hits": len(sw_hits),
        "shared_world_hit_rate": round(len(sw_hits) / len(sw), 4) if sw else None,
        "measured_cold_tokens_total": cum_cold,
        "measured_cold_tokens_mean": round(cum_cold / max(1, sum(
            1 for r in rows if r["tokens_spent_on_derivation"])), 1),
        "cumulative_tokens_saved": cum_saved,
        "curve": curve, "rows": rows,
    }
    with open(OUT, "w") as f:
        json.dump(result, f, indent=2)
    print(f"\n=== overall hit rate {result['overall_hit_rate']} "
          f"({hits}/{len(rows)}); shared-world {result['shared_world_hit_rate']} "
          f"({len(sw_hits)}/{len(sw)})")
    print(f"=== measured cold mean {result['measured_cold_tokens_mean']} tok/derivation; "
          f"cumulative saved {cum_saved} tok")
    print(f"=== wrote {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
