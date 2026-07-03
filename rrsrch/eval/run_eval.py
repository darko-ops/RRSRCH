#!/usr/bin/env python3
"""Phase 0 exit criteria, now runnable on the REAL stack. Builds a corpus,
deposits the seed set, then measures:

  1. paraphrase hit rate   — paraphrased queries match the RIGHT deposit (high).
  2. scope false-hit rate  — scope-different near-misses do NOT match (~0).
  3. warm/cold cost ratio  — a served hit costs <10% of the cold path.

Env knobs:
  RRSRCH_STORE=memory|postgres        (postgres: docker compose up -d db + migrate)
  RRSRCH_EMBEDDER=hash|minilm|local   (hash: offline floor; minilm: the real model)
  RRSRCH_SIMILARITY_THRESHOLD=<float> (single-threshold mode)
  RRSRCH_EVAL_SWEEP=lo:hi:step        (sweep mode: prints the hit-rate vs
                                       false-hit curve and picks the knee — the
                                       highest threshold maximizing hits with
                                       false-hits AND wrong-topic hits at zero)

Scoring happens ONCE per probe (rank scores are threshold-independent); a sweep
just re-thresholds the recorded scores, so MiniLM inference isn't repeated.

    PYTHONPATH=src python -m eval.run_eval
"""
from __future__ import annotations

import asyncio
import os
import sys
from dataclasses import dataclass

from rrsrch import agreement
from rrsrch.config import Settings
from rrsrch.corpus import Corpus
from rrsrch.embeddings import get_embedder
from rrsrch.factory import build_store
from rrsrch.matching import engine
from rrsrch.schemas import DepositIn
from rrsrch.telemetry import estimate_tokens

from eval.dataset import (IMPLICIT_SCOPE_CONFLICT, IMPLICIT_SCOPE_PRESERVING,
                          INTENT_FLIP, INTENT_PRESERVING, PARAPHRASES,
                          SCOPE_NEARMISS)

# Offline default 0.42 (hash embedder operating point, see DECISIONS); MiniLM is
# tuned via the sweep. Override via env.
DEFAULT_THRESHOLD = {"hash": 0.42}


@dataclass
class Probe:
    top_similarity: float   # fused score of the best (scope-gated) candidate
    correct: bool           # is that candidate the intended deposit?
    guard_pass: bool = True # serve-path intent guard verdict on that candidate
    guard_rule: str = "no_signal"
    pair_in_ranked: bool = True   # did the intended deposit SURVIVE the gates?


async def _truncate_postgres(settings: Settings) -> None:
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    eng = create_async_engine(settings.database_url)
    async with eng.begin() as conn:
        await conn.execute(text("TRUNCATE deposits, query_events, topic_state, depositor_trust"))
    await eng.dispose()


async def _fresh_corpus(settings: Settings) -> Corpus:
    if settings.store == "postgres":
        await _truncate_postgres(settings)
    return Corpus(build_store(settings), get_embedder(settings), settings)


async def _probe(corpus: Corpus, probe_q: str, scope, correct_id: str | None) -> Probe:
    """Rank once + evaluate the serve-path intent guard on the top candidate,
    using the SAME shared function corpus.search uses (agreement.intent_verdict)."""
    kw = dict(k=corpus.settings.candidate_k, vector_weight=corpus.settings.vector_weight,
              lexical_weight=corpus.settings.lexical_weight)
    ranked = await engine.rank(corpus.store, corpus.embedder, probe_q, scope, **kw)
    if not ranked:
        return Probe(0.0, False, pair_in_ranked=False)
    iv = agreement.intent_verdict(corpus.extractor.extract(probe_q),
                                  corpus.extractor.extract(ranked[0].record.query))
    correct = correct_id is not None and str(ranked[0].record.id) == correct_id
    survived = correct_id is None or any(str(m.record.id) == correct_id for m in ranked)
    return Probe(ranked[0].similarity, correct, iv.match, iv.rule, survived)


async def score(settings: Settings) -> tuple[
        list[Probe], list[Probe], list[Probe], list[Probe],
        list[Probe], list[Probe], int]:
    """Score all four sets. The intent sets get ISOLATED corpora so their
    deposits cannot perturb the original paraphrase/scope numbers."""
    corpus = await _fresh_corpus(settings)
    deposit_of: dict[str, str] = {}
    for tid, q, claim, vol, _para in PARAPHRASES:
        rec = await corpus.deposit(DepositIn(query=q, claim=claim, volatility_hint=vol))
        deposit_of[tid] = str(rec.id)
    for q, claim, vol, scope, _pq, _ps in SCOPE_NEARMISS:
        await corpus.deposit(DepositIn(query=q, claim=claim, volatility_hint=vol, scope=scope))

    para = [await _probe(corpus, probe_q, None, deposit_of[tid])
            for tid, _q, _claim, _vol, probe_q in PARAPHRASES]
    # ANY candidate surviving the scope gate and clearing the threshold is a
    # false hit — correctness is irrelevant here, serving at all is the bug.
    scope_probes = [await _probe(corpus, probe_q, probe_scope, None)
                    for _q, _claim, _vol, _scope, probe_q, probe_scope in SCOPE_NEARMISS]

    flip_corpus = await _fresh_corpus(settings)
    for _tid, q, claim, _probe_q in INTENT_FLIP:
        await flip_corpus.deposit(DepositIn(query=q, claim=claim))
    # serving ANYTHING to a flipped-intent probe is a wrong answer
    flips = [await _probe(flip_corpus, probe_q, None, None)
             for _tid, _q, _claim, probe_q in INTENT_FLIP]

    keep_corpus = await _fresh_corpus(settings)
    keep_of = {}
    for tid, q, claim, _probe_q in INTENT_PRESERVING:
        keep_of[tid] = str((await keep_corpus.deposit(DepositIn(query=q, claim=claim))).id)
    keeps = [await _probe(keep_corpus, probe_q, None, keep_of[tid])
             for tid, _q, _claim, probe_q in INTENT_PRESERVING]

    isc_corpus = await _fresh_corpus(settings)
    for _tid, q, claim, _probe_q in IMPLICIT_SCOPE_CONFLICT:
        await isc_corpus.deposit(DepositIn(query=q, claim=claim))
    # serving ANYTHING to a conflicting-implicit-scope probe is a wrong answer
    isc = [await _probe(isc_corpus, probe_q, None, None)
           for _tid, _q, _claim, probe_q in IMPLICIT_SCOPE_CONFLICT]

    isp_corpus = await _fresh_corpus(settings)
    isp_of = {}
    for tid, q, claim, _probe_q in IMPLICIT_SCOPE_PRESERVING:
        isp_of[tid] = str((await isp_corpus.deposit(DepositIn(query=q, claim=claim))).id)
    isp = [await _probe(isp_corpus, probe_q, None, isp_of[tid])
           for tid, _q, _claim, probe_q in IMPLICIT_SCOPE_PRESERVING]

    served_tokens = estimate_tokens(PARAPHRASES[0][2])
    return para, scope_probes, flips, keeps, isc, isp, served_tokens


def evaluate(para: list[Probe], scope_probes: list[Probe], threshold: float
             ) -> tuple[float, float, int]:
    # a hit must clear similarity AND the intent guard — exactly like corpus.search
    hits = sum(1 for p in para
               if p.correct and p.guard_pass and p.top_similarity >= threshold)
    wrong = sum(1 for p in para
                if not p.correct and p.guard_pass and p.top_similarity >= threshold)
    false_hits = sum(1 for p in scope_probes
                     if p.guard_pass and p.top_similarity >= threshold)
    return hits / len(para), false_hits / len(scope_probes), wrong


def evaluate_iscope(isc: list[Probe], isp: list[Probe], threshold: float
                    ) -> tuple[int, int, int]:
    """(implicit-scope false hits, preserving hits, preserving pairs the gate
    wrongly removed from the pool — the over-gating count, embedder-independent)."""
    false_hits = sum(1 for p in isc if p.guard_pass and p.top_similarity >= threshold)
    keep_hits = sum(1 for p in isp
                    if p.correct and p.guard_pass and p.top_similarity >= threshold)
    over_gated = sum(1 for p in isp if not p.pair_in_ranked)
    return false_hits, keep_hits, over_gated


def evaluate_intent(flips: list[Probe], keeps: list[Probe], threshold: float
                    ) -> tuple[int, int, int, int]:
    """(intent false hits, flips the guard rejected, preserving hits,
    preserving pairs the guard wrongly blocked)."""
    false_hits = sum(1 for p in flips if p.guard_pass and p.top_similarity >= threshold)
    guard_caught = sum(1 for p in flips if not p.guard_pass)
    keep_hits = sum(1 for p in keeps
                    if p.correct and p.guard_pass and p.top_similarity >= threshold)
    over_rejected = sum(1 for p in keeps if p.correct and not p.guard_pass)
    return false_hits, guard_caught, keep_hits, over_rejected


def pick_knee(para: list[Probe], scope_probes: list[Probe],
              lo: float, hi: float, step: float) -> float:
    """Highest hit rate subject to the HARD CONSTRAINT (false-hits = 0, wrong-topic
    serves = 0); ties resolve to the HIGHER threshold (more conservative)."""
    best_t, best_rate = hi, -1.0
    t = lo
    while t <= hi + 1e-9:
        rate, false_rate, wrong = evaluate(para, scope_probes, t)
        if false_rate == 0.0 and wrong == 0 and rate >= best_rate:
            best_t, best_rate = t, rate
        t = round(t + step, 10)
    return best_t


async def main() -> int:
    embedder = os.environ.get("RRSRCH_EMBEDDER", "hash")
    settings = Settings(
        store=os.environ.get("RRSRCH_STORE", "memory"),
        embedder=embedder,
        cold_path_estimate_tokens=90_000,
    )
    para, scope_probes, flips, keeps, isc, isp, served_tokens = await score(settings)

    sweep = os.environ.get("RRSRCH_EVAL_SWEEP")
    if sweep:
        lo, hi, step = (float(x) for x in sweep.split(":"))
        print(f"threshold sweep {lo}→{hi} (step {step})  "
              f"embedder={embedder} store={settings.store}")
        print(f"{'threshold':>9} | {'paraphrase hits':>15} | {'scope false-hits':>16} | wrong-topic")
        t = lo
        while t <= hi + 1e-9:
            rate, false_rate, wrong = evaluate(para, scope_probes, t)
            print(f"{t:>9.2f} | {rate*100:>14.1f}% | {false_rate*100:>15.1f}% | {wrong:>11}")
            t = round(t + step, 10)
        knee = pick_knee(para, scope_probes, lo, hi, step)
        print(f"\nknee (max hits, false-hits=0, wrong-topic=0, prefer higher): {knee:.2f}")
        threshold = knee
    else:
        threshold = float(os.environ.get(
            "RRSRCH_SIMILARITY_THRESHOLD",
            DEFAULT_THRESHOLD.get(embedder, Settings().similarity_threshold)))

    rate, false_rate, wrong = evaluate(para, scope_probes, threshold)
    ifh, guard_caught, keep_hits, over_rejected = evaluate_intent(flips, keeps, threshold)
    isc_fh, isp_hits, over_gated = evaluate_iscope(isc, isp, threshold)
    cold = settings.cold_path_estimate_tokens
    cost_ratio = served_tokens / cold

    print("\n" + "=" * 60)
    print(f"embedder={embedder}  store={settings.store}  similarity_threshold={threshold}")
    print("=" * 60)
    print(f"1. paraphrase hit rate : {rate*100:.1f}%  "
          f"({int(rate*len(para))}/{len(para)}; wrong-topic serves: {wrong})")
    print(f"2. scope false-hit rate: {false_rate*100:.1f}%  "
          f"({int(false_rate*len(scope_probes))}/{len(scope_probes)})")
    print(f"3. warm hit cost       : {served_tokens} tok = {cost_ratio*100:.2f}% of cold ({cold})")
    print(f"4. intent false-hits   : {ifh}/{len(flips)}  "
          f"(guard rejected {guard_caught}/{len(flips)} flips)")
    print(f"5. intent-preserving   : {keep_hits}/{len(keeps)} hit  "
          f"(guard wrongly blocked: {over_rejected})")
    print(f"6. implicit-scope false-hits: {isc_fh}/{len(isc)}")
    print(f"7. implicit-scope preserving: {isp_hits}/{len(isp)} hit  "
          f"(gate wrongly removed: {over_gated})")

    ok1 = rate >= 0.80
    ok2 = false_rate == 0.0 and wrong == 0
    ok3 = cost_ratio < 0.10
    ok4 = ifh == 0
    ok5 = over_rejected == 0
    ok6 = isc_fh == 0
    ok7 = over_gated == 0
    print("\nEXIT CRITERIA")
    print(f"  [{'PASS' if ok1 else 'FAIL'}] paraphrases hit at high rate (>=80%)")
    print(f"  [{'PASS' if ok2 else 'FAIL'}] scope near-misses / wrong topics do NOT serve")
    print(f"  [{'PASS' if ok3 else 'FAIL'}] warm hit < 10% of cold path")
    print(f"  [{'PASS' if ok4 else 'FAIL'}] intent flips do NOT serve (false-hit = 0)")
    print(f"  [{'PASS' if ok5 else 'FAIL'}] guard blocks no intent-preserving paraphrase")
    print(f"  [{'PASS' if ok6 else 'FAIL'}] implicit-scope conflicts do NOT serve")
    print(f"  [{'PASS' if ok7 else 'FAIL'}] gate removes no implicit-scope-preserving pair")
    passed = ok1 and ok2 and ok3 and ok4 and ok5 and ok6 and ok7
    print(f"\n{'✓ EVAL PASSED' if passed else '✗ EVAL FAILED'}")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
