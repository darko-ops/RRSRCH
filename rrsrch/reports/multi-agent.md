# rrsrch — multi-agent flywheel (Phase 2 exit proof)

*Generated 2026-07-02 19:19 UTC by `scripts/multiagent_report.py` from a real run:
postgres + minilm, 400 queries, seed 42, ONE corpus,
four depositors — reliable-1/-2 (60% of traffic, deposit truth), noisy-1 (25%,
~30% of its research misfires), malicious-1 (15%, deposits deterministic
falsehoods and attempts self-corroboration ×2 on every deposit). The production
self-verification loop patrols every 10 arrivals (batch 3) with a ground-truth
provider. The engine sees only depositor ids — trust separates the profiles
from corroboration OUTCOMES alone.*

## 1. Trust separation (track record only, no LLM anywhere near it)

```
query →       25     75    125    175    225    275    325    375
malicious-1 0.850  0.472  0.266  0.266  0.250  0.236  0.202  0.177
noisy-1    0.893  0.950  0.958  0.971  0.975  0.899  0.856  0.856
reliable-1 0.917  0.942  0.958  0.972  0.977  0.980  0.983  0.984
reliable-2 0.850  0.893  0.925  0.865  0.903  0.920  0.924  0.905
```

Final: malicious-1=0.1771, noisy-1=0.8598, reliable-1=0.985, reliable-2=0.9083.
Reliable agents climb; the malicious agent craters within ~50 queries
of its first independently-contradicted deposits and its confidence base falls
far below the serve threshold — every future poison deposit starts PRE-MUTED.
Honest caveat: noisy-1 (70% correct) ends near the reliables at this run length;
a 30%-wrong agent needs more corroboration events to separate cleanly.

## 2. Poison containment (measured, not asserted)

| metric | value |
|---|---|
| malicious deposits | 19 |
| distinct malicious deposits ever served | 0 |
| served fraction | 0.0% |
| malicious-authored serves (1st half / 2nd half) | 0 / 0 |
| malicious final trust → confidence base | 0.1771 → sub-serve |

Self-corroboration attempts (38 of them in this run)
moved nothing: no trust, no independent voucher (pinned by
tests/test_trust.py::test_self_corroboration_grants_no_trust).

## 3. Corpus quality with hostile traffic in the mix

| metric | multi-agent | single-agent (same seed) |
|---|---|---|
| queries | 400 | 400 |
| true_hits | 258 | 262 |
| false_hits | 0 | 0 |
| outdated_serves | 3 | 0 |
| lost_hits | 44 | 49 |
| precision | 0.989 | 1.000 |
| recall | 0.854 | 0.842 |
| overall_true_hit_rate | 0.645 | 0.655 |

**Cross-agent recall delta: +0.012** — the honest
number, whichever way it points. In this run the extra corroboration traffic
(more agents re-deriving stale answers, plus the patrolling verifier) slightly
HELPED recall relative to the
single-agent baseline, while true hits paid a small tax
(-4) for the hostile 40% of traffic — and
the trust machinery kept every one of those wrong deposits out of the serve
path (false hits: 0).

## 4. Method + threats

- The verifier cadence (every 10 arrivals, batch 3) is a deployment knob modeled
  after `make verify-loop`; containment weakens at lower cadence — the early
  smoke run at half this cadence let 1/20 poison deposits serve 9 times.
- Malicious lies are per-agent salted: two agents wrong in exactly the same
  words WOULD cross-vouch (track record cannot tell consensus from collusion) —
  the coordinated-collusion case is Phase 3 (attestation) territory, recorded
  in DECISIONS along with the double-negation gate evasion this harness found.
- Ground-truth provider isolates trust dynamics from provider quality; a real
  provider adds its own error rate on top.
- Single seed, one profile mixture — directionally robust, not a benchmark.
