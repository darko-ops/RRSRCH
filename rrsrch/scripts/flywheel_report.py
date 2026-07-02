#!/usr/bin/env python3
"""Generate reports/flywheel.md from a REAL run: Postgres + MiniLM + the full
unmodified serve path, driven by labeled Zipfian traffic at 3 exponents.

    RRSRCH_STORE=postgres RRSRCH_EMBEDDER=minilm \
        PYTHONPATH=src:. python scripts/flywheel_report.py [n_queries] [seed]
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from rrsrch.config import Settings

from eval.flywheel import RunResult, curve, run_stream, summarize
from eval.intents import INTENTS
from eval.traffic import generate_stream

ROOT = Path(__file__).resolve().parent.parent
S_VALUES = (0.8, 1.0, 1.2)
N = int(sys.argv[1]) if len(sys.argv) > 1 else 400
SEED = int(sys.argv[2]) if len(sys.argv) > 2 else 42


def ascii_curve(results: dict[float, RunResult], width_every: int = 50) -> str:
    xs = sorted({end for r in results.values() for end, _, _ in curve(r.records)
                 if end % width_every == 0})
    lines = ["queries →  " + " ".join(f"{x:>5}" for x in xs)]
    for s, r in sorted(results.items()):
        pts = {end: rate for end, rate, _ in curve(r.records)}
        lines.append(f"s={s:<4}     " + " ".join(
            f"{pts[x]*100:>4.0f}%" if x in pts else "    ." for x in xs))
    sizes = {end: size for end, _, size in curve(results[1.0].records)}
    lines.append("corpus     " + " ".join(f"{sizes.get(x, 0):>5}" for x in xs))
    return "\n".join(lines)


def false_hit_examples(results: dict[float, RunResult], limit: int = 6) -> str:
    out = []
    for s, r in sorted(results.items()):
        for rec in r.records:
            if rec.classification == "false_hit" and len(out) < limit:
                out.append(f"[s={s}] q#{rec.idx} ({rec.cause}) asked: {rec.query_text!r}\n"
                           f"        served deposit for: {rec.served_query!r}\n"
                           f"        served claim: {rec.served_claim!r}")
    return "\n".join(out) if out else "(none observed in these runs)"


async def main() -> None:
    settings = Settings(store=os.environ.get("RRSRCH_STORE", "postgres"),
                        embedder=os.environ.get("RRSRCH_EMBEDDER", "minilm"))
    results: dict[float, RunResult] = {}
    for s in S_VALUES:
        print(f"running s={s} ({N} queries, seed={SEED}) on "
              f"{settings.store}+{settings.embedder}...")
        r = await run_stream(generate_stream(N, s=s, seed=SEED), settings)
        r.s = s
        results[s] = r
        print(f"  → {summarize(r)['overall_true_hit_rate']*100:.1f}% true-hit overall")

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    summaries = {s: summarize(r) for s, r in results.items()}
    mid = summaries[1.0]
    em = results[1.0].engine_metrics

    def srow(fmt, key) -> str:
        return " | ".join(fmt.format(summaries[s][key]) if summaries[s][key] is not None
                          else "n/a" for s in S_VALUES)

    report = f"""# rrsrch — flywheel curve on synthetic-but-honest traffic

*Generated {now} by `scripts/flywheel_report.py` from a real run:
{settings.store} + {settings.embedder}, {N} queries per exponent, seed {SEED},
{len(INTENTS)} intents / 4 domains. The engine (matching, scope gate, intent
guard, confidence) ran UNMODIFIED and never saw a label.*

## 1. The flywheel curve (windowed true-hit rate, window=50)

```
{ascii_curve(results)}
```

Each line is one traffic assumption (Zipf exponent s over intent popularity).
The curve starts near 0 on a cold corpus and bends upward as deposits
accumulate — the flywheel. **Headline: {mid['overall_true_hit_rate']*100:.1f}%
overall true-hit rate under Zipf(s=1.0)**, with the s=0.8/1.2 band showing how
much the traffic assumption moves it.

## 2. Precision / recall (s = {" / ".join(str(s) for s in S_VALUES)})

| metric | {" | ".join(f"s={s}" for s in S_VALUES)} |
|---|---|---|---|
| queries | {srow("{}", "queries")} |
| served | {srow("{}", "served")} |
| true hits | {srow("{}", "true_hits")} |
| **false hits** | {srow("**{}**", "false_hits")} |
| outdated serves | {srow("{}", "outdated_serves")} |
| lost hits (recall gap) | {srow("{}", "lost_hits")} |
| correct misses | {srow("{}", "correct_misses")} |
| **precision** | {srow("**{:.3f}**", "precision")} |
| **recall** | {srow("**{:.3f}**", "recall")} |

### False-hit breakdown (by cause, all runs)
{_breakdown_table(summaries, "false_hit_breakdown")}

### Recall gap: why correct answers weren't served (all runs)
{_breakdown_table(summaries, "lost_hit_breakdown")}

`below_similarity_threshold` is the real-world cost of the conservative 0.525
threshold; `confidence_below_threshold` is the freshness gate doing its job on
volatile intents (those queries re-derive and corroborate — correct behavior,
but counted against recall here, honestly).

### Observed false-hit examples (real served-wrong-answer events)
```
{false_hit_examples(results)}
```

## 3. Net token economics (s=1.0 run, from real query_events)

| metric | value |
|---|---|
| tokens saved by exploiting | {em['total_tokens_saved']:,} |
| tokens spent (all queries + corroboration) | {em['tokens_with_rrsrch']:,} |
| cold-path counterfactual | {em['tokens_without_rrsrch']:,} |
| reduction | {em['reduction_pct']}% |
| corroborations (agreed/disagreed) | {em['corroborations']['agreed']}/{em['corroborations']['disagreed']} |

## 4. Methodology

- **Traffic:** {N} arrivals per run. Intent popularity ~ Zipf(s), s swept
  {S_VALUES}. Mixture (stated assumptions): 15% unrelated one-offs, and per
  intent arrival 7% intent-flips / 7% scope-variants where applicable, rest
  paraphrases drawn uniformly. Arrivals spaced 5–45 simulated minutes; truth for
  volatile intents CHANGES at the stream midpoint, so staleness/corroboration is
  exercised organically.
- **Matcher-blind generation:** paraphrases are static hand/LLM-authored
  rewordings written without computing any embedding or similarity score, never
  filtered afterwards; variant selection is a uniform seeded draw
  (`tests/test_flywheel_harness.py::test_traffic_generation_is_matcher_blind`
  pins that `eval/intents.py` and `eval/traffic.py` import no rrsrch/model code
  and call no matcher machinery).
- **Scoring:** labels (intent, scope, polarity) live only in the harness
  registry; a serve is a TRUE hit only if all three match AND the claim is the
  current truth. False hits are counted by label mismatch — never assumed zero.
- **Production-shaped corpus growth:** miss → deposit under the asked wording;
  stale on one's own question → corroborate (agreed re-earns / disagreed
  supersedes); serves are trusted (no deposit) exactly as a real caller would.

## 5. Threats to validity

- **The traffic mixture is an assumption.** Real agent traffic may be more or
  less overlapping than Zipf(s∈[0.8,1.2]); the band bounds the assumption, it
  does not eliminate it. The mixture rates (15/7/7) are stated, not measured.
- **Paraphrase realism ceiling.** Authored rewordings are natural but finite
  (4–5 per intent); real users produce weirder wordings, so recall here is
  likely an UPPER bound on organic recall.
- **Intent diversity floor.** {len(INTENTS)} intents across 4 domains is small;
  wrong-intent false hits grow with corpus density within a domain, so precision
  at 10× corpus size is not proven by this run.
- **Ground-truth claims are synthetic** (prices/versions are plausible, not
  live), which is fine for matching measurement but means the corroboration
  events here say nothing about real-provider distillation quality.
- **One seed per exponent.** Curves are windowed rates on a single stream
  realization; rerun with other seeds before quoting a decimal point.
"""
    out = ROOT / "reports" / "flywheel.md"
    out.parent.mkdir(exist_ok=True)
    out.write_text(report)
    print(f"wrote {out}")


def _breakdown_table(summaries: dict, key: str) -> str:
    causes = sorted({c for s in summaries.values() for c in s[key]})
    if not causes:
        return "(empty)"
    head = "| cause | " + " | ".join(f"s={s}" for s in sorted(summaries)) + " |"
    sep = "|---" * (len(summaries) + 1) + "|"
    rows = ["| " + c + " | " + " | ".join(str(summaries[s][key].get(c, 0))
                                          for s in sorted(summaries)) + " |"
            for c in causes]
    return "\n".join([head, sep, *rows])


if __name__ == "__main__":
    asyncio.run(main())
