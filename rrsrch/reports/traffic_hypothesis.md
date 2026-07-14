# Is matching precision a TRAFFIC problem, not a matcher problem?

**Run:** 2026-07-03 · MiniLM bi-encoder + local cross-encoders (CPU) · **zero LLM calls,
zero derivations** · SAME scoring path as the FAQ reranker A/B (`reranker_ab.score_pairs`,
reused unchanged) · new set `eval/specific_questions.json` + `eval/specific_pairs.json` ·
harness `scripts/traffic_hypothesis.py` · raw `reports/traffic_hypothesis.json`.

## Verdict (up front)

**Largely SUPPORTED: matching precision is substantially a traffic property.** On specific,
multi-clause questions the FAQ **inversion disappears** — positives sit clearly above
negatives (fused median gap **0.34 → 0.30 apart**, IQRs disjoint), production-threshold
precision leaps **0.13 → 0.79**, and the cross-encoder gains a **usable 93%-recall @ 3.7%-false-hit**
operating point that the FAQ set never had. **But not fully:** specific questions still show
**tail overlap** — a minority of lexically-twinned same-family requirements score as high as
the weakest true paraphrases — so guaranteeing *zero* false hits via a single threshold still
costs recall (recall@0-FP ≈ 0.32 fused). **Specificity mitigates the matcher problem; it does
not eliminate it.** The matcher is much healthier than the FAQ eval implied; the reranker earns
its keep here (unlike on FAQ). This measures **separability, not organic hit rate** (§ threats).

---

## Phase 1 — the specific-question set (composition + provenance)

| | |
|---|---|
| Questions | 60 — **32 anchors** (verbatim NIST SP 800-171r2 requirement statements) + **28 paraphrases** |
| Families | SC 8, AC 8, IA 6, CM 6, SI 4 |
| Pairs | 120 — **28 MATCH**, **92 NO_MATCH** |
| **POSITIVES** | **100% AUTHORED** paraphrases (flagged `authored=true`), deliberately lexically-varied, every constraint preserved |
| **HARD NEGATIVES** | **100% NATURAL** — two *different* real NIST requirements from the *same family* (same subtopic, different ask) |
| Provenance | anchors `NIST SP 800-171 Rev.2 §<id>` (verbatim, from the archived PDF); positives `AUTHORED paraphrase of §<id>` |

**Sourcing note (honest):** the intended scenario-question sources — Reddit / Stack Exchange
threads — were unreachable via the available web tools, and vendor deep-dive articles proved to
be declarative, not verbatim scenario questions. So the set is **regulatory (800-171)**: real,
specific, multi-clause, but **narrower than the "50k-token GovCloud/enclave scenario" ideal**.
Real scenario questions carry *more* distinguishing signal (named environments, multi-constraint
scenarios), so this set likely **understates** the hypothesis (§ threats).

---

## Phase 3 — the decisive figure: POS vs HARD-NEG, specific vs FAQ

Quartiles (min · q25 · **median** · q75 · max):

```
FUSED (bi-encoder cosine·0.7 + lexical·0.3)
  SPECIFIC  POS  0.493 · 0.558 · [0.642] · 0.695 · 0.759
            NEG  0.146 · 0.279 · [0.342] · 0.419 · 0.685      << NEG IQR entirely BELOW POS IQR
  FAQ       POS  0.434 · 0.566 · [0.621] · 0.730 · 0.872
            NEG  0.305 · 0.469 · [0.515] · 0.551 · 0.965      << NEG max 0.965 ABOVE POS max 0.872 (inverted)

CROSS-ENCODER (stsb)
  SPECIFIC  POS  0.591 · 0.842 · [0.898] · 0.920 · 0.997
            NEG  0.128 · 0.328 · [0.449] · 0.559 · 0.913      << clean median gap 0.45
  FAQ       POS  0.051 · 0.317 · [0.698] · 0.984 · 1.000
            NEG  0.000 · 0.128 · [0.386] · 0.696 · 1.000      << both span [0,1]: total overlap
```

**What moved:** the *positives barely changed* (fused median 0.621→0.642). The **negatives
collapsed downward** (fused NEG median 0.515→0.342; NEG q75 0.551→0.419). Different *specific*
requirements share far less surface than different *FAQ one-liners* — so the gap opened.

**Recall achievable at ZERO false hits** (fraction of positives strictly above the highest negative):

| metric | SPECIFIC | FAQ |
|---|---:|---:|
| fused | **0.321** | **0.000** (inverted) |
| cross-encoder | **0.286** | 0.024 |

FAQ: **0%** — no positive outscores the worst negative (the inversion). Specific: a real,
positive separable fraction — but only ~30%, because of tail overlap, not zero.

---

## Phase 2 — precision / recall / false-hit (same configs)

Specific set (120 pairs, 28 pos / 92 hard-neg):

| config | served | TP | FP | precision | recall | **false-HR** |
|---|---:|--:|--:|---:|---:|---:|
| (a) fused @ **0.525** (prod) | 34 | 27 | 7 | **0.794** | 0.964 | **0.206** |
| (a) fused @ 0.71 (FAQ-strict) | 4 | 4 | 0 | 1.000 | 0.143 | 0.000 |
| (a) fused @ fp0 = 0.685 | 9 | 9 | 0 | 1.000 | 0.321 | 0.000 |
| (a) fused @ fp1 = 0.62 | 16 | 15 | 1 | 0.938 | 0.536 | 0.062 |
| (c) cross-encoder @ fp1 = 0.742 | 27 | 26 | 1 | **0.963** | **0.929** | **0.037** |
| (c) cross-encoder @ fp0 = 0.914 | 8 | 8 | 0 | 1.000 | 0.286 | 0.000 |

**Compare to FAQ** (reranker.md, pair mode): fused @ 0.525 → precision **0.132**, false-HR
**0.691**. Same threshold, same matcher, **6× the precision** on specific questions
(0.13 → 0.79). And the cross-encoder @ fp1 delivers **93% recall at 3.7% false-hit** — a
frontier that simply did not exist on FAQ traffic (there, the CE lost to a strict threshold).
*(Absolute precision is composition-dependent — the pair balances differ — so the
composition-robust evidence is the distributions and recall@0-FP above.)*

---

## The explicit answer

- **Do specific positives sit clearly above negatives?** **Yes on the bulk** — median gap 0.30
  (fused) / 0.45 (CE), IQRs disjoint, the FAQ inversion gone, production precision 6× higher.
- **A clean threshold with false-hits→0 at good recall?** **Not quite via one threshold**
  (recall@0-FP ≈ 0.32) — residual **tail** overlap remains. **But the cross-encoder gets
  ~93% recall at ~4% false-hit**, a genuinely usable operating point.
- **Do they still overlap/invert like FAQ?** **No inversion; residual tail overlap only.**
  Qualitatively different from FAQ's wholesale collapse.

**Landing:** closer to *"matcher is largely fine — pivot toward specific traffic"* than to
*"matching is hard regardless."* The FAQ false-hit crisis was substantially a property of
short, lexically-collapsed FAQ questions. The residual (lexically-twinned same-family
requirements — e.g., crypto-in-transit vs crypto-at-rest; monitor vs control vs protect
communications) is a **smaller, second-order** problem — the subject/entity axis flagged in
`reports/facet_gate.md`, not a fundamental matcher failure.

---

## THREATS TO VALIDITY — read loudly

- **Positives are 100% AUTHORED** (the set's biggest threat). If my paraphrases are easier than
  natural restatements, precision is inflated. Mitigations: they were written lexically-divergent
  (min positive fused **0.493** — some positives *are* hard), and the **negatives are 100%
  natural**, so the *negative* collapse (the actual driver of the separability gain) is not
  authored. Still: a natural-paraphrase set could move the positive numbers.
- **This measures SEPARABILITY, not organic hit rate.** Whether specific questions actually
  *repeat* in real traffic (so the corpus gets hits at all) is a *different* question requiring
  real traffic — explicitly out of scope. A clean matcher on questions that never recur is worth
  nothing; that's the next study, not this one.
- **Regulatory, not scenario-style** (sourcing note). Real 50k-token scenario questions likely
  separate *even better* (more distinguishing entities) — so this set probably **understates** the
  effect. But that's an inference, not measured.
- **Small, single-vertical:** 28 positives / 92 negatives, CMMC/800-171 only. Every number is
  directional; recall@0-FP rests on which single negative is the max.
- **Same-family negatives may be *too* hard** in the opposite direction: some (crypto-in-transit
  vs crypto-at-rest) are arguably near-duplicate asks — labeling them NO_MATCH is defensible but
  a stricter rater could call a few PARTIAL, which would *raise* measured separability.
- **CE thresholds (fp0/fp1) were read off THIS small set**, not held out — in-sample operating
  points, optimistic by construction.

_Exit criteria: (1) real specific-question equivalence set, labeled, provenance-tagged,
authored/natural flagged — ✅; (2) same A/B configs run, precision/recall/false-hit — ✅;
(3) side-by-side separability figure + explicit traffic-vs-matcher verdict — ✅; (4) this report
with loud caveats — ✅._
