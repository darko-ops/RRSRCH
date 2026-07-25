#!/usr/bin/env python3
"""Design-partner shadow analysis: replay a partner's real agent traces against
an empty corpus and answer TWO INDEPENDENT questions.

    GATE A (economics) — how much of their token spend was avoidable reuse?
    GATE B (safety)    — of the answers we would have reused, how many were RIGHT?

The gates are reported separately and BOTH must pass. They are deliberately not
combined into one score: a system can post excellent savings while serving wrong
knowledge, and in a compliance setting that trade is unacceptable. Savings never
buys down a precision failure here.

An UNMEASURED gate is NOT a pass. Gate B resolves only against blind judgments
supplied by a human; without them it reports UNDETERMINED and the run does not
pass. (Same discipline as the cost ledger: a zero means "nothing reported",
never "nothing wrong".) Gate B is never scored by the matcher judging itself.

WORKFLOW (two passes, because the judgments can only exist after a replay
reveals which serves actually happened):

    1. PYTHONPATH=src python scripts/pilot_report.py traces.jsonl \\
           --emit-judgments judgments.todo.jsonl
       Replays, prints Gate A, reports Gate B as UNDETERMINED, and writes every
       (question, answer-we-would-have-served) pair needing a verdict.

    2. A human marks each row correct true/false — BLIND, without seeing the
       similarity score or which deposit it came from.

    3. PYTHONPATH=src python scripts/pilot_report.py traces.jsonl \\
           --judgments judgments.done.jsonl
       Both gates resolve.

INPUT (JSONL, one trace per line). Required: timestamp, actor_id, session_id,
query, answer. Optional: workflow, sources, derivation_tokens, model.

    {"timestamp": "2026-03-02T14:05:00Z", "actor_id": "agent-7",
     "session_id": "s-221", "workflow": "control-lookup",
     "query": "how long must audit logs be retained",
     "answer": "Audit logs must be retained for 3 years.",
     "sources": ["https://..."], "derivation_tokens": 48210, "model": "..."}

`answer` is REQUIRED and the script refuses to run without it: with queries
alone you can measure repetition, but nothing can be deposited, so nothing can
be served, so safe reuse is unmeasurable — and safe reuse is the whole claim.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any

from rrsrch.config import Settings
from rrsrch.corpus import Corpus
from rrsrch.embeddings import get_embedder
from rrsrch.schemas import DepositIn, Source
from rrsrch.store.memory import InMemoryStore

REQUIRED = ("timestamp", "actor_id", "session_id", "query", "answer")

# Defaults are the pilot's pre-registered thresholds. Set them BEFORE looking at
# the data — that is the point of pre-registration.
DEFAULT_MIN_REDUCTION_PCT = 20.0
DEFAULT_MIN_PRECISION_PCT = 99.0


VOLATILITIES = ("low", "medium", "high")


def build_embedder_or_fail(settings: Settings):
    """A pilot run must never silently fall back to the offline hash embedder.
    Its paraphrase recall is a FLOOR, not production behaviour, so numbers
    produced with it are not partner-reportable — quoting them as if they were
    MiniLM's would overstate misses (Gate A) and understate the matcher's real
    exposure (Gate B). If the configured model cannot load, stop."""
    try:
        return get_embedder(settings)
    except Exception as e:                                   # noqa: BLE001
        sys.exit(f"pilot_report: embedder {settings.embedder!r} failed to load "
                 f"({type(e).__name__}: {e}).\n"
                 f"  Refusing to fall back to the hash embedder — its recall is a "
                 f"floor, not production behaviour.\n"
                 f"  Fix the model/network, or run explicitly with "
                 f"RRSRCH_EMBEDDER=hash for a NON-pilot-grade smoke run.")


class _Clock:
    """Replays at the traces' OWN timestamps so confidence decay is real: a
    claim deposited in March is genuinely 60 days old when queried in May."""

    def __init__(self) -> None:
        self.t = datetime(1970, 1, 1, tzinfo=timezone.utc)

    def __call__(self) -> datetime:
        return self.t


def _parse_ts(raw: str) -> datetime:
    t = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def load_traces(path: str) -> list[dict[str, Any]]:
    traces, problems = [], []
    with open(path) as fh:
        for n, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as e:
                problems.append(f"line {n}: bad JSON ({e.msg})")
                continue
            missing = [f for f in REQUIRED if not row.get(f)]
            if missing:
                problems.append(f"line {n}: missing {', '.join(missing)}")
                continue
            try:
                row["_ts"] = _parse_ts(row["timestamp"])
            except ValueError:
                problems.append(f"line {n}: unparseable timestamp {row['timestamp']!r}")
                continue
            traces.append(row)
    if problems:
        print(f"! {len(problems)} unusable trace(s); first few:", file=sys.stderr)
        for p in problems[:5]:
            print(f"    {p}", file=sys.stderr)
    if not traces:
        sys.exit("pilot_report: no usable traces. `answer` is required — without it "
                 "safe reuse cannot be measured (see module docstring).")
    traces.sort(key=lambda r: r["_ts"])          # temporal order; no look-ahead
    return traces


def load_judgments(path: str) -> dict[str, bool]:
    """Blind verdicts keyed by serve id. Rows without an explicit boolean
    `correct` are treated as UNJUDGED (not as correct) — silence is never
    counted in the numerator."""
    out: dict[str, bool] = {}
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            if isinstance(row.get("correct"), bool) and row.get("serve_id"):
                out[str(row["serve_id"])] = row["correct"]
    return out


def _judgment_volatility_mismatch(path: str, selected: str) -> str | None:
    """Judgments are only valid for the run that produced them: a different
    volatility can serve a different answer for the same trace."""
    seen = set()
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if line:
                v = json.loads(line).get("volatility")
                if v:
                    seen.add(v)
    off = seen - {selected}
    return sorted(off)[0] if off and selected not in seen else None


async def replay(traces: list[dict[str, Any]], settings: Settings,
                 default_volatility: str = "medium") -> dict[str, Any]:
    clock = _Clock()
    corpus = Corpus(InMemoryStore(), build_embedder_or_fail(settings), settings, now=clock)

    serves: list[dict[str, Any]] = []
    hits = stale = misses = 0
    measured_cost = measured_n = 0        # derivations that happened in the replay
    all_reported_cost = all_reported_n = 0  # every trace's own cost, replay-independent
    warm_tokens = 0
    seen_by_actor: dict[str, set[str]] = {}
    session_repeats = cross_actor_repeats = same_actor_repeats = 0
    seen_triples: set[tuple[str, str, str]] = set()
    seen_key_actors: dict[str, set[str]] = {}

    for i, t in enumerate(traces):
        clock.t = t["_ts"]
        q, actor, session = t["query"], str(t["actor_id"]), str(t["session_id"])

        # Traffic shape, computed WITHOUT the matcher (exact normalized text
        # only), in three buckets. A repeat inside ONE session is a loop/retry
        # and is NOT evidence of reusable knowledge; the same actor asking again
        # in a LATER session is. Compared against every prior sighting, not just
        # the first — otherwise a loop is only visible when that session happened
        # to ask first.
        key = " ".join(q.lower().split())
        if (key, actor, session) in seen_triples:
            session_repeats += 1
        elif key in seen_key_actors:
            if actor in seen_key_actors[key]:
                same_actor_repeats += 1       # later session, same asker
            else:
                cross_actor_repeats += 1      # a different asker converged
        seen_triples.add((key, actor, session))
        seen_key_actors.setdefault(key, set()).add(actor)
        seen_by_actor.setdefault(actor, set()).add(session)

        dt_any = t.get("derivation_tokens")
        if isinstance(dt_any, int) and dt_any > 0:
            all_reported_cost += dt_any       # what THEY paid, hit or not
            all_reported_n += 1

        r = await corpus.search(q)
        if r.serve:
            hits += 1
            serves.append({
                "serve_id": f"srv-{i:05d}",
                "asked": q,
                "answer_we_would_have_served": r.claim,
                # the partner's OWN answer for this query, for the judge to compare
                "their_actual_answer": t["answer"],
                "volatility": default_volatility,   # judgments are tied to this run
                "correct": None,          # <- the human fills this in, blind
            })
        else:
            if r.outcome == "stale":
                stale += 1
            else:
                misses += 1
            # cold path: the partner really did derive this, so deposit THEIR
            # answer with THEIR measured cost. Nothing is re-derived here.
            dt = t.get("derivation_tokens")
            if isinstance(dt, int) and dt > 0:
                measured_cost += dt
                measured_n += 1
            await corpus.deposit(DepositIn(
                query=q, claim=str(t["answer"]),
                sources=[Source(url=u) for u in (t.get("sources") or [])
                         if isinstance(u, str)],
                volatility_hint=t.get("volatility_hint", default_volatility),
                depositor=actor,
                derivation_tokens=dt if isinstance(dt, int) and dt > 0 else None,
            ))

    m = await corpus.metrics()
    warm_tokens = m["warm_hits"]["tokens_served_total"]
    return {
        "traces": len(traces), "actors": len(seen_by_actor),
        "sessions": sum(len(v) for v in seen_by_actor.values()),
        "span_days": round((traces[-1]["_ts"] - traces[0]["_ts"]).total_seconds() / 86400, 1),
        "workflows": len({t.get("workflow") or "-" for t in traces}),
        "hits": hits, "stale": stale, "misses": misses,
        "session_repeats": session_repeats, "cross_actor_repeats": cross_actor_repeats,
        "same_actor_repeats": same_actor_repeats,
        "measured_cost": measured_cost, "measured_n": measured_n,
        "all_reported_cost": all_reported_cost, "all_reported_n": all_reported_n,
        "warm_tokens": warm_tokens, "serves": serves, "metrics": m,
    }


def gate_a(rep: dict[str, Any], settings: Settings, floor: float) -> dict[str, Any]:
    """ECONOMICS. Prefers SUMMED partner-reported costs over any unit average —
    derivations vary widely and a mean would smear that. The configured estimate
    fills in only for traces that reported no cost, and that fill-in is disclosed
    as coverage rather than hidden inside the total."""
    total = rep["traces"]
    derivations = rep["stale"] + rep["misses"]
    unit = ((rep["all_reported_cost"] / rep["all_reported_n"])
            if rep["all_reported_n"] else float(settings.cold_path_estimate_tokens))

    # what they DID spend: every trace was a real cold derivation for them
    without = rep["all_reported_cost"] + unit * (total - rep["all_reported_n"])
    # what they WOULD have spent: derive only on stale/miss, plus warm serves
    # and the verification the system pays to keep the cache safe
    verification = rep["metrics"]["net_savings"]["verification_tokens_spent"]
    with_rrsrch = (rep["measured_cost"] + unit * (derivations - rep["measured_n"])
                   + rep["warm_tokens"] + verification)
    reduction = 100 * (1 - with_rrsrch / without) if without else 0.0
    return {
        "cost_basis": "measured" if rep["all_reported_n"] else
                      "ESTIMATED (no derivation_tokens reported)",
        # coverage over DERIVATIONS, not over all traces: a hit needs no
        # derivation cost, so counting it in the denominator understates coverage
        "cost_coverage_pct": (round(100 * rep["measured_n"] / derivations, 1)
                              if derivations else 100.0),
        "trace_cost_coverage_pct": (round(100 * rep["all_reported_n"] / total, 1)
                                    if total else 0.0),
        "mean_derivation_tokens": round(unit, 1),
        "derivations_avoided": total - derivations,
        "tokens_without": round(without),
        "tokens_with": round(with_rrsrch),
        "verification_tokens": verification,
        "net_reduction_pct": round(reduction, 2),
        "threshold_pct": floor,
        "verdict": "PASS" if reduction >= floor else "FAIL",
    }


def gate_b(rep: dict[str, Any], judgments: dict[str, bool], floor: float) -> dict[str, Any]:
    """SAFETY. Resolves ONLY from blind human verdicts. No judgments ⇒
    UNDETERMINED, which is not a pass — the matcher never grades itself."""
    served = rep["serves"]
    judged = [s for s in served if s["serve_id"] in judgments]
    if not served:
        return {"verdict": "UNDETERMINED", "reason": "no answers were served",
                "served": 0, "judged": 0, "threshold_pct": floor}
    if not judged:
        return {"verdict": "UNDETERMINED",
                "reason": f"{len(served)} serves, 0 blind judgments supplied "
                          f"(rerun with --judgments)",
                "served": len(served), "judged": 0, "threshold_pct": floor}
    correct = sum(1 for s in judged if judgments[s["serve_id"]])
    precision = 100 * correct / len(judged)
    coverage = 100 * len(judged) / len(served)
    return {
        "served": len(served), "judged": len(judged),
        "judgment_coverage_pct": round(coverage, 1),
        "correct": correct, "incorrect": len(judged) - correct,
        "precision_pct": round(precision, 2),
        "threshold_pct": floor,
        "verdict": "PASS" if precision >= floor else "FAIL",
    }


def render(rep: dict[str, Any], a: dict[str, Any], b: dict[str, Any],
           sweep: list[dict[str, Any]], settings: Settings, selected: str) -> str:
    pilot_grade = settings.embedder != "hash"
    L = [
        "=" * 66, "PILOT SHADOW REPORT", "=" * 66,
        f"embedder {settings.embedder} @ threshold {settings.similarity_threshold} "
        f"| volatility {selected}",
        f"traces {rep['traces']} | actors {rep['actors']} | sessions {rep['sessions']} "
        f"| span {rep['span_days']}d | workflows {rep['workflows']}",
        "",
        "TRAFFIC SHAPE (matcher not consulted — exact text only)",
        f"  cross-actor repeats : {rep['cross_actor_repeats']}   <- different asker converged",
        f"  same-actor, later   : {rep['same_actor_repeats']}   <- real recurrence too",
        f"  same-session repeats: {rep['session_repeats']}   <- loops/retries, NOT reuse",
        "",
        "REPLAY (temporal, empty corpus, no look-ahead, no re-derivation)",
        f"  hits {rep['hits']} | stale {rep['stale']} | misses {rep['misses']}",
        "",
        "VOLATILITY SENSITIVITY (always shown — this assumption moves the result",
        "more than any other, so it is never reported as a single number)",
        "  class    half-life     hits   stale   net reduction",
    ] + [
        f"  {s['volatility']:<8} {s['half_life']:<12} {s['hits']:>5} {s['stale']:>7}"
        f"   {s['net_reduction_pct']:>7}%"
        + ("   <- SELECTED" if s["volatility"] == selected else "")
        for s in sweep
    ] + [
        f"  spread: {max(s['net_reduction_pct'] for s in sweep) - min(s['net_reduction_pct'] for s in sweep):.2f}"
        f" percentage points between the best and worst class."
        " Classify from the partner's DOMAIN, not from which number flatters the pitch.",
        "",
        "-" * 66,
        f"GATE A — ECONOMICS   (net token reduction >= {a['threshold_pct']}%)",
        "-" * 66,
        f"  cost basis        : {a['cost_basis']} — {a['cost_coverage_pct']}% of "
        f"derivations priced, {a['trace_cost_coverage_pct']}% of traces",
        f"  mean derivation   : {a['mean_derivation_tokens']} tokens",
        f"  derivations avoided: {a['derivations_avoided']} of {rep['traces']}",
        f"  without rrsrch    : {a['tokens_without']}",
        f"  with rrsrch       : {a['tokens_with']}  (incl. {a['verification_tokens']} verification)",
        f"  NET REDUCTION     : {a['net_reduction_pct']}%",
        f"  VERDICT           : {a['verdict']}",
        "",
        "-" * 66,
        f"GATE B — SAFETY      (serve precision >= {b['threshold_pct']}%)",
        "-" * 66,
    ]
    if b["verdict"] == "UNDETERMINED":
        L += [f"  served            : {b['served']}",
              f"  VERDICT           : UNDETERMINED — {b['reason']}"]
    else:
        L += [f"  serves judged     : {b['judged']}/{b['served']} "
              f"({b['judgment_coverage_pct']}% coverage)",
              f"  correct/incorrect : {b['correct']} / {b['incorrect']}",
              f"  PRECISION         : {b['precision_pct']}%",
              f"  VERDICT           : {b['verdict']}"]
    overall = "PASS" if (a["verdict"] == "PASS" and b["verdict"] == "PASS") else "NOT PASSED"
    L += [
        "", "=" * 66,
        f"OVERALL: {overall}"
        + ("" if pilot_grade else "   [NOT PILOT-GRADE — hash embedder]"),
        "  The gates are independent and BOTH must pass. Savings do not offset a",
        "  precision failure, and an UNDETERMINED safety gate is not a pass.",
    ] + ([] if pilot_grade else [
        "  The hash embedder is an OFFLINE FLOOR, not production behaviour: these",
        "  numbers are a smoke test and must not be shown to a partner. Rerun with",
        "  RRSRCH_EMBEDDER=local.",
    ]) + ["=" * 66]
    return "\n".join(L)


async def main() -> None:
    ap = argparse.ArgumentParser(description="Two-gate pilot shadow analysis.")
    ap.add_argument("traces", help="JSONL of partner traces")
    ap.add_argument("--judgments", help="JSONL of blind correct/incorrect verdicts")
    ap.add_argument("--emit-judgments", help="write the judgment worksheet here")
    ap.add_argument("--min-reduction", type=float, default=DEFAULT_MIN_REDUCTION_PCT)
    ap.add_argument("--min-precision", type=float, default=DEFAULT_MIN_PRECISION_PCT)
    ap.add_argument("--volatility", choices=("low", "medium", "high"), default="medium",
                    help="decay class for traces that don't declare one. Domain-driven: "
                         "slow-changing corpora (regulation, standards) are 'low'; the "
                         "'medium' default expires in 3 days and will read as stale if "
                         "questions recur less often than that.")
    ap.add_argument("--json", help="also write the full report as JSON")
    args = ap.parse_args()

    settings = Settings(
        store="memory",
        embedder=os.environ.get("RRSRCH_EMBEDDER", "hash"),
        similarity_threshold=float(os.environ.get("RRSRCH_SIMILARITY_THRESHOLD", "0.55")),
    )
    traces = load_traces(args.traces)

    # The sweep is NOT optional. Volatility is an analyst's judgment call that
    # swings the outcome more than any other input, so every class is replayed
    # and printed; the selected one cannot be quoted without its neighbours
    # visible beside it.
    half_lives = {"low": f"{settings.half_life_low_days:g}d",
                  "medium": f"{settings.half_life_medium_days:g}d",
                  "high": f"{settings.half_life_high_hours:g}h"}
    sweep, reps = [], {}
    for vol in VOLATILITIES:
        r = await replay(traces, settings, vol)
        reps[vol] = r
        sweep.append({"volatility": vol, "half_life": half_lives[vol],
                      "hits": r["hits"], "stale": r["stale"],
                      "net_reduction_pct": gate_a(r, settings,
                                                  args.min_reduction)["net_reduction_pct"]})

    rep = reps[args.volatility]
    judgments = load_judgments(args.judgments) if args.judgments else {}
    if args.judgments:
        stale_j = _judgment_volatility_mismatch(args.judgments, args.volatility)
        if stale_j:
            print(f"! judgments were emitted under volatility {stale_j!r} but this run "
                  f"selected {args.volatility!r}; the served answers may differ.",
                  file=sys.stderr)

    a = gate_a(rep, settings, args.min_reduction)
    b = gate_b(rep, judgments, args.min_precision)
    print(render(rep, a, b, sweep, settings, args.volatility))

    if args.emit_judgments:
        with open(args.emit_judgments, "w") as fh:
            for s in rep["serves"]:
                fh.write(json.dumps(s) + "\n")
        print(f"\nwrote {len(rep['serves'])} rows to {args.emit_judgments} — mark each "
              f'"correct": true/false BLIND, then rerun with --judgments.')
    if args.json:
        with open(args.json, "w") as fh:
            json.dump({"summary": {k: v for k, v in rep.items() if k != "serves"},
                       "gate_a_economics": a, "gate_b_safety": b}, fh,
                      indent=2, default=str)

    sys.exit(0 if (a["verdict"] == "PASS" and b["verdict"] == "PASS") else 1)


if __name__ == "__main__":
    asyncio.run(main())
