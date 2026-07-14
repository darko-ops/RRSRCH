# Do specific/expensive questions RECUR across independent askers? (goldilocks study)

**Run:** 2026-07-03 · real 11-origin CMMC question corpus · **blind** equivalence labels
(matcher-independent) · **zero derivations, zero matcher-scored clustering** ·
harnesses `scripts/recurrence_study.py` + `scripts/recurrence_phase4.py` ·
raw `reports/recurrence.json`, `reports/recurrence_phase4.json`.

## Verdict (up front)

**In reachable PUBLIC data, the goldilocks band is not clearly visible: recurrence and
precision are anti-correlated.** Cross-source recurrence is real but modest (**13%**) and
lives at **generic→moderate** specificity; the **specific/hyper buckets contain zero
recurrences** — but that is a **sourcing artifact** (public FAQ pages structurally aggregate
common questions; specific ones live in forums/RFPs unreachable here), **not proven absence**.
Meanwhile separability (traffic_hypothesis.md) is *best* at high specificity. So the two
properties the shared corpus needs — *recurs* and *matches-precisely* — sit at **opposite ends**
of the measurable range. **Moderate specificity is the only candidate overlap** (recurs 13%,
and shows large median score-separation, CE pos-median 0.98 vs neg 0.49) but is **underpowered**
(n=5 natural positives). **Loud caveat: this is CROSS-WEB, not WITHIN-ORG** — a team re-asking
its *own* specific questions is structurally higher recurrence and is **not tested here**; a low
public number does **not** kill the enterprise/within-org thesis.

---

## Phase 1 — corpus, provenance, and the honest sourcing limit

**Source:** the existing real corpus — **188 verbatim CMMC questions from 11 independent
origins** (`eval/equivalence_questions.json`): Kelser, Charles IT, Forvis Mazars, Exostar,
CMMC.com, **DoD CIO (regulator)**, IBSS, Cherry Bekaert, Sentar, databrackets, PreVeil. Each
question carries its origin URL. Eleven different real askers/publishers ≥ the required 8.

**The limit (stated loudly):** the task's Phase-1 ideal — mining 300–500 questions from
Reddit / Stack Exchange / GovCon forums / RFPs — is **not reachable with the available web
tools** (confirmed across prior tasks: those sources don't surface via search, and vendor
deep-dives are declarative, not verbatim questions). So the corpus **skews generic/moderate**
and I did **not** fabricate specific-question sources. Consequence: the **high-specificity end
of the goldilocks curve is unmeasured**, not measured-empty.

**Specificity rubric (deterministic):** score = 2·(control-IDs/versions/reg-cites) +
(named-tech/environment terms) + (scenario/conditional markers). Buckets: generic ≤1, moderate
2–3, specific 4–5, hyper 6+. Distribution: **generic 126, moderate 51, specific 9, hyper 2** —
the corpus is 94% generic/moderate. (This skew IS the limitation.)

---

## Phase 2 — BLIND clustering (no matcher score used)

Clusters = connected components over the **MATCH** edges of `equivalence_pairs.json`, whose
labels are `llm-fable5-blind` (LLM labelers that never saw any similarity/embedding score) +
adversarial-verify + hand-override — **matcher-independent by construction** (the circularity
the task forbids is avoided). 188 questions → **154 distinct underlying questions** (components).

**Hand spot-check (required):** all 20 cross-source clusters reviewed by hand — **18/20 clean**
(e.g., "consequences of non-compliance" across Kelser/CMMC.com/databrackets; "self-assess vs
C3PAO" across 4 origins), **2 marginal** (C9 folds "what is CMMC" with "why need CMMC"; C16
"how implement" vs "how/when enforced"), **0 wrong**. Blind labels are high quality.

---

## Phase 3 — recurrence, overall and stratified (THE goldilocks curve)

**Overall:** 20 of 154 distinct questions recur across ≥2 independent sources = **13.0%**.
Sources-per-cluster: **134 single-source, 12×2, 5×3, 3×4.**

| specificity | #questions | #clusters | #recurring (≥2 src) | **recurrence rate** |
|---|---:|---:|---:|---:|
| generic | 126 | 98 | 14 | **14.3%** |
| moderate | 51 | 45 | 6 | **13.3%** |
| specific | 9 | 9 | 0 | **0.0%** (n=9) |
| hyper-specific | 2 | 2 | 0 | **0.0%** (n=2) |

```
recurrence %
 15 |  ●───────●                         ● generic 14.3%   (n=126)
    |  generic  moderate                 ● moderate 13.3%  (n=51)
 10 |                                    specific/hyper: NO DATA
  5 |                                    (0/9, 0/2 — FAQ pages
  0 |                    ○·········○      structurally lack these)
    +--generic--moderate--specific--hyper
```

**Read:** recurrence is **flat ~13–14% through generic→moderate** — it does **not** decline as
specificity rises into the moderate zone (mildly encouraging: recurrence survives some
specificity). Then it **falls off a data cliff**, not necessarily a recurrence cliff: the
specific buckets have 9 and 2 questions, all single-source, because **FAQ corpora don't contain
specific questions**. The 0% is **uninterpretable as absence** — it is the sourcing limit made
visible.

---

## Phase 4 — separability on NATURAL positives (the squeeze, cross-tabbed)

Natural positives = the real cross-source paraphrase pairs (not authored). Separability
(recall achievable at zero false hits) stratified by specificity, vs natural same-topic
negatives:

| bucket | n_pos | fused recall@0FP (pos-med/neg-med) | CE recall@0FP (pos-med/neg-med) |
|---|---:|---|---|
| generic | 37 | 0.19 (0.61 / 0.51) | 0.05 (0.64 / 0.37) |
| moderate | 5 | 0.00 (0.69 / 0.54) | 0.00 (**0.98** / 0.49) |
| specific | **0** | n/a — no natural positives | n/a |
| hyper | 0 | n/a | n/a |
| *authored specific (contrast)* | 28 | *0.32 (0.49 / 0.69)* | *0.29 (0.59 / 0.91)* |

**The squeeze, in one table:**
- The buckets that **recur** (generic n=37, moderate n=5) separate **poorly** on the strict
  metric (recall@0FP ≤ 0.19). *Note:* moderate shows a **huge CE median gap (0.98 vs 0.49)** —
  the strict 0.00 is one high negative over n=5 positives, so moderate is **promising but
  underpowered**, not refuted.
- The bucket that **separates** best (specific, authored recall@0FP 0.29–0.32 from
  traffic_hypothesis) has **zero natural positives** — no public recurrence to validate it.
- So in the measurable data, **recurrence and separability are anti-correlated**, and the
  authored-positive caveat from traffic_hypothesis.md **cannot be retired** — because natural
  specific paraphrases don't exist in reachable public sources.

---

## The verdict, precisely

**Does a band exist where questions are specific-enough-to-match AND valuable AND recurring?**

- **Not demonstrably, in reachable PUBLIC cross-web data.** Recurrence (~13%) lives at
  generic/moderate; precision lives at specific; the overlap (moderate) recurs *and* shows
  strong median separation but is **too thin (n=5) to confirm a usable band**.
- **Moderate specificity is the candidate band** — it is the *only* bucket with both non-zero
  recurrence (13.3%) and large score-separation (CE). If the band exists publicly, it is here,
  and this study can neither confirm nor deny it at n=5.
- **The high-specificity band is unmeasured, not empty** — a sourcing artifact of FAQ corpora.

**What this does NOT say (the load-bearing caveat):** this is **cross-web** recurrence across
*independent public publishers*. It says nothing about **within-org** recurrence — the same
team, or adjacent teams in one enterprise, re-asking their *own* specific questions (SSP
scoping, their enclave, their contract). That is structurally far higher (shared context,
repeated audits, staff turnover) and is the actual beachhead. **A weak public number does not
weaken the enterprise thesis** — which requires real org traffic to measure and is out of scope.

---

## THREATS TO VALIDITY — read loudly

- **The specific-bucket zero is a SOURCING artifact, not evidence of no recurrence.** FAQ pages
  aggregate *common* questions by construction; specific questions live in forums/RFPs
  unreachable here. The single most important caveat: **the goldilocks band's key region is
  UNMEASURED.**
- **CROSS-WEB ≠ WITHIN-ORG** (restated because it is decisive). The enterprise/within-org model
  is untouched and remains the stronger bet; this study cannot refute it.
- **Tiny n at the interesting end:** moderate natural positives n=5; specific n=0. Every
  high-specificity conclusion is underpowered or absent.
- **Single vertical (CMMC), 11 origins, 188 questions.** Recurrence rate (~13%) is corpus- and
  vertical-specific; a broader or narrower vertical would move it.
- **Label subjectivity:** clusters are LLM-blind-labeled (hand spot-check 18/20 clean, 2
  marginal). A stricter rater merging/splitting a few clusters shifts the small counts.
- **Specificity rubric is a heuristic** (constraint-counting); reasonable alternatives would
  reclassify a handful of moderate/specific questions and move the thin high-spec counts.

_Exit criteria: (1) real ≥8-origin corpus, provenance + specificity-scored — ✅ (11 origins;
high-spec mining unreachable, flagged); (2) BLIND non-matcher clustering + cross-source
recurrence — ✅; (3) recurrence-vs-specificity curve — ✅; (4) natural-positive separability
re-confirmation — ✅ (result: natural positives exist only at generic/moderate, so the specific
separability can't be re-confirmed on natural data — reported honestly); (5) verdict + cross-web-
vs-within-org caveat — ✅._
