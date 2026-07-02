# rrsrch — flywheel curve on synthetic-but-honest traffic

*Generated 2026-07-02 18:38 UTC by `scripts/flywheel_report.py` from a real run:
postgres + minilm, 400 queries per exponent, seed 42,
24 intents / 4 domains. The engine (matching, scope gate, intent
guard, confidence) ran UNMODIFIED and never saw a label.*

## 1. The flywheel curve (windowed true-hit rate, window=50)

```
queries →     50   100   150   200   250   300   350   400
s=0.8        38%   54%   58%   62%   78%   66%   74%   64%
s=1.0        46%   58%   64%   74%   80%   72%   66%   66%
s=1.2        54%   68%   68%   74%   74%   74%   68%   72%
corpus        26    40    51    59    67    72    85    95
```

Each line is one traffic assumption (Zipf exponent s over intent popularity).
The curve starts near 0 on a cold corpus and bends upward as deposits
accumulate — the flywheel. **Headline: 65.8%
overall true-hit rate under Zipf(s=1.0)**, with the s=0.8/1.2 band showing how
much the traffic assumption moves it.

## 2. Precision / recall (s = 0.8 / 1.0 / 1.2)

| metric | s=0.8 | s=1.0 | s=1.2 |
|---|---|---|---|
| queries | 400 | 400 | 400 |
| served | 254 | 263 | 276 |
| true hits | 247 | 263 | 276 |
| **false hits** | **0** | **0** | **0** |
| outdated serves | 7 | 0 | 0 |
| lost hits (recall gap) | 59 | 48 | 40 |
| correct misses | 87 | 89 | 84 |
| **precision** | **0.972** | **1.000** | **1.000** |
| **recall** | **0.807** | **0.846** | **0.873** |

### False-hit breakdown (by cause, all runs)
(empty)

### Recall gap: why correct answers weren't served (all runs)
| cause | s=0.8 | s=1.0 | s=1.2 |
|---|---|---|---|
| below_similarity_threshold | 12 | 11 | 5 |
| confidence_below_threshold | 47 | 37 | 35 |

`below_similarity_threshold` is the real-world cost of the conservative 0.525
threshold; `confidence_below_threshold` is the freshness gate doing its job on
volatile intents (those queries re-derive and corroborate — correct behavior,
but counted against recall here, honestly).

### Observed false-hit examples (real served-wrong-answer events)
```
(none observed in these runs)
```

## 3. Net token economics (s=1.0 run, from real query_events)

| metric | value |
|---|---|
| tokens saved by exploiting | 23,664,171 |
| tokens spent (all queries + corroboration) | 12,335,829 |
| cold-path counterfactual | 36,000,000 |
| reduction | 65.7% |
| corroborations (agreed/disagreed) | 36/6 |

## 4. Methodology

- **Traffic:** 400 arrivals per run. Intent popularity ~ Zipf(s), s swept
  (0.8, 1.0, 1.2). Mixture (stated assumptions): 15% unrelated one-offs, and per
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
- **Intent diversity floor.** 24 intents across 4 domains is small;
  wrong-intent false hits grow with corpus density within a domain, so precision
  at 10× corpus size is not proven by this run.
- **Ground-truth claims are synthetic** (prices/versions are plausible, not
  live), which is fine for matching measurement but means the corroboration
  events here say nothing about real-provider distillation quality.
- **One seed per exponent.** Curves are windowed rates on a single stream
  realization; rerun with other seeds before quoting a decimal point.
