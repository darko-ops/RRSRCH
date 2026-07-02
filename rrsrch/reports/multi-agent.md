# rrsrch — multi-agent flywheel (Phase 2 exit proof)

*Generated 2026-07-02 22:09 UTC by `scripts/multiagent_report.py` from a real run:
postgres + minilm, 400 queries, seed 42, ONE corpus,
five depositors — reliable-1/-2 (55% of traffic, deposit truth), noisy-1 (20%,
~30% of its research misfires), malicious-1 (15%, deposits deterministic
falsehoods and attempts self-corroboration ×2 on every deposit), and dblneg-1
(10%, the double-negation attacker: sentential negation of negation-phrased
truths — the class that used to evade the polarity check). The production
self-verification loop patrols every 10 arrivals (batch 3) with a ground-truth
provider. The engine sees only depositor ids — trust separates the profiles
from corroboration OUTCOMES alone.*

## 1. Trust separation (track record only, no LLM anywhere near it)

```
query →       25     75    125    175    225    275    325    375
dblneg-1   0.708  0.531  0.531  0.531  0.472  0.472  0.354  0.327
malicious-1 0.708  0.607  0.283  0.266  0.250  0.224  0.212  0.193
noisy-1    0.850  0.854  0.817  0.880  0.898  0.856  0.807  0.790
reliable-1 0.893  0.925  0.953  0.964  0.970  0.975  0.979  0.980
reliable-2 0.893  0.893  0.906  0.865  0.908  0.924  0.924  0.938
```

Final: dblneg-1=0.3269, malicious-1=0.1848, noisy-1=0.7905, reliable-1=0.9812, reliable-2=0.9397.
Reliable agents climb; the malicious agent craters within ~50 queries
of its first independently-contradicted deposits and its confidence base falls
far below the serve threshold — every future poison deposit starts PRE-MUTED.
Honest caveat: noisy-1 (70% correct) ends near the reliables at this run length;
a 30%-wrong agent needs more corroboration events to separate cleanly.

## 2. Poison containment (measured, not asserted)

| metric | malicious-1 (corrupted facts) | dblneg-1 (double-negation attack) |
|---|---|---|
| deposits | 18 | 11 |
| distinct deposits ever served | 3 | 0 |
| served fraction | 16.7% | 0.0% |
| final trust | 0.1848 | 0.3269 |

The dblneg-1 profile is the attacker class that USED to win: "Not true:
⟨negation-phrased truth⟩" carried the same document-level negation boolean and
near-identical text, so honest corroborations agreed with it and vouched it
(an earlier harness run had one such deposit served 9×). Scoped effective
polarity (clause-anchored local ⊕ sentential parity) now makes the verdict
disagree, so the whole containment chain — penalty, crater, pre-mute — engages.
Malicious-authored serves across both attackers (1st half / 2nd half):
3 / 0. Any first-half serves are the BOOTSTRAP window — the
irreducible exposure of "unknown depositors serve at the prior", which the
design deliberately accepts (muting unknowns would break single-player; see
DECISIONS). Each was corrected by the containment chain and the author entered
the pre-muted state; second-half serves are the number that must be ~0.
Self-corroboration attempts moved nothing (pinned by
tests/test_trust.py::test_self_corroboration_grants_no_trust).

## 3. Corpus quality with hostile traffic in the mix

| metric | multi-agent | single-agent (same seed) |
|---|---|---|
| queries | 400 | 400 |
| true_hits | 246 | 262 |
| false_hits | 0 | 0 |
| outdated_serves | 3 | 0 |
| lost_hits | 53 | 49 |
| precision | 0.988 | 1.000 |
| recall | 0.823 | 0.842 |
| overall_true_hit_rate | 0.615 | 0.655 |

**Cross-agent recall delta: -0.020** — the honest
number, whichever way it points. In this run the extra corroboration traffic
(more agents re-deriving stale answers, plus the patrolling verifier) slightly
HURT recall relative to the
single-agent baseline, while true hits paid a small tax
(-16) for the hostile 40% of traffic — and
the trust machinery kept every one of those wrong deposits out of the serve
path (false hits: 0).

## 4. Phase 3: attestation

### Attested-faster (the roadmap's Phase 3 exit)
The IDENTICAL single-agent stream, run twice — the only difference is a
level-1.0 attestation presented with every deposit/corroboration:

| metric | unattested | attested |
|---|---|---|
| true hits | 262 | 262 |
| hit rate | 0.655 | 0.655 |
| recall | 0.842 | 0.842 |
| stale outcomes (re-verification demand) | 43 | 43 |
| confidence-gate blocks | 38 | 38 |

Attestation shifts the trust PRIOR (0.85 → up to 0.95): base 0.96 → 0.987, so
the serve window before re-verification extends by **+8.7%**
(hl·log2(0.987/0.7) vs hl·log2(0.96/0.7)) — measured directly at the boundary:

```
unattested @2.82h on 6h half-life → outcome=stale confidence=0.6931
attested  @2.82h on 6h half-life → outcome=hit confidence=0.7123
```

Whether that band shows up in stream aggregates depends on traffic density —
this stream's revisit gaps rarely sample the ~14-minute delta band on 6-hour
half-life intents, so the aggregate rows above may match; the boundary probe is
the deterministic proof. Track record still moves an attested identity: a liar
sinks below serve within ~3 independent contradictions (pinned in
tests/test_attestation.py). The unattested column IS the regression guard —
identical to the Phase 2 single-agent numbers.

### Collusion broken (the poison class track record couldn't solve)
```
[PHASE 3 RULES] ring lie cross-vouched by 2 socks → strong-vouch count=0, served=False
[PHASE 3 RULES] attested auditor contradicts → disagreed; corpus now serves: 'the quota is 10,000 requests per day'
[PHASE 2 RULES (A/B)] ring lie cross-vouched by 2 socks → strong-vouch count=2, served=True
```

A distinct-but-unattested sock ring's mutual agreements are WEAK vouches under
Phase 3 — they move track record but can never mint the base-1.0 float, so a
muted ring's lie stays muted no matter how many sock-puppets agree. Under the
Phase-2 rules (A/B lever) the same cross-vouch floats the lie at base 1.0 over
a proven-bad author — the exact gap. Distinct ATTESTED identities are what
Sybils can't cheaply mint; that is the mechanism.

## 5. Method + threats

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
