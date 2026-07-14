# Threshold sweep — can a cutoff fix precision, or do we need a question-type gate?

**Run:** 2026-07-03 · same captured Phase-A set (44 queries) · Postgres + MiniLM ·
**zero new derivations** (28 run-1 answers reused from `organic.deposits`; no
`SearchProvider` constructed — token spend provably 0) · harness
`scripts/threshold_sweep.py` + `scripts/compute_sweep.py` · raw `reports/sweep_raw.json`.

## VERDICT (up front)

**NOT SEPARABLE by a threshold.** False and true hits **overlap** in similarity — the
false-hit band `[0.565, 0.620]` sits *entirely inside* the true-hit band `[0.556, 0.827]`
and straddles the true median (0.625). No single cutoff drives false-hits to ~0 without
gutting the true-positive rate, and in the 0.525→0.60 band raising the threshold makes
precision **worse**. The false hits are a **question-type** problem (`deadline` vs
`who-complies`, `cost` vs `duration`, `validity` vs `how-to-get`, `enclave` vs `CUI`) that a
magnitude cutoff cannot see. **Next step: build a question-type / intent gate — not a retune.**

---

## 1. Sweep table (7 points; zero token spend)

Labels: **T**rue / **P**artial / **F**alse. `prec_s`=true/served, `prec_l`=(true+partial)/served,
`TPrate`=true/44, `falseHR`=false/served.

| threshold | served | raw HR | T | P | F | prec_s | prec_l | **TP rate** | **false-HR** |
|---:|---:|---:|--:|--:|--:|---:|---:|---:|---:|
| **0.525** | 15 | 0.341 | 7 | 3 | 5 | 0.467 | 0.667 | **0.159** | **0.333** |
| 0.575 | 12 | 0.273 | 6 | 1 | 5 | 0.500 | 0.583 | 0.136 | 0.417 |
| 0.60 | 12 | 0.273 | 5 | 1 | **6** | 0.417 | 0.500 | 0.114 | **0.500** |
| 0.65 | 5 | 0.114 | 4 | 1 | 0 | 0.800 | 1.000 | 0.091 | 0.000 |
| 0.70 | 3 | 0.068 | 3 | 0 | 0 | 1.000 | 1.000 | 0.068 | 0.000 |
| 0.75 | 2 | 0.045 | 2 | 0 | 0 | 1.000 | 1.000 | 0.045 | 0.000 |
| 0.80 | 2 | 0.045 | 2 | 0 | 0 | 1.000 | 1.000 | 0.045 | 0.000 |

Two things jump out:

1. **False hits are non-monotonic in the usable band.** 0.525→0.575→0.60 gives false counts
   **5 → 5 → 6** and false-HR **0.33 → 0.42 → 0.50**. Raising the threshold here makes
   precision *worse*, because a stricter cutoff sends more queries to miss→deposit, the corpus
   gets denser, and new near-miss collisions appear (`deadline`→`process-duration`,
   `cost`→`process-duration`, `requirements`→`what-is-CMMC`). You cannot nudge your way out.
2. **Zeroing false hits costs most of the recall.** False-HR only reaches 0 at **0.65**, where
   true positives fall from **7 → 4** (TP rate 0.159 → 0.091, −43%) — and 1 of those 4 is a
   placeholder artifact (below). At 0.70+ you keep 2–3 true hits total. Precision 1.0 is bought
   by throwing away 60–70% of the real value.

---

## 2. The diagnostic — TRUE vs FALSE similarity at 0.525

Every served hit at the operating threshold, split by hand-adjudicated label:

```
TRUE    (n=7):  0.556  0.581  0.616  0.625  0.680  0.721  0.827   min 0.556  median 0.625  max 0.827
PARTIAL (n=3):  0.530  0.577  0.686
FALSE   (n=5):  0.565  0.580  0.598  0.617  0.620   min 0.565  median 0.598  max 0.620
```

- **FALSE hits do NOT cluster below TRUE hits.** The false range `[0.565, 0.620]` is a
  *subset* of the true range `[0.556, 0.827]`. Four of the seven true hits (0.556, 0.581,
  0.616, 0.625) sit **at or below** the highest false hit (0.620).
- **Overlap band `[0.565, 0.620]` is non-empty** → not cleanly separable, by definition.
- A cutoff placed just above the worst false hit (`>0.620`) keeps only **4 of 7** true hits —
  and the empirical sweep is harsher still (new false hits appear between 0.525 and 0.60 before
  any disappear).

```
similarity →  0.55        0.60        0.65        0.70        0.75      0.80   0.83
TRUE          x   x        x  x        x                        (spread up to 0.827)
FALSE             x  x  x  x x   (all crammed in 0.565–0.620, inside the TRUE cloud)
```

The false hits are semantically distinct **question types** about the same topic that MiniLM
embeds as near as genuine paraphrases: *"what's the **deadline**"* vs *"**who** must comply"*;
*"how **much** does it cost"* vs *"how **long** does it take"*; *"certification **validity**"* vs
*"**how to get** certified"*; *"CUI **enclave**"* vs *"what is **CUI**"*. Cosine+lexical
similarity has no axis for "these ask for different *kinds* of answer."

---

## 3. New pairs surfaced by the sweep (LLM-labeled, flagged)

Denser corpora at higher thresholds produced 5 (query, matched-deposit) pairs not seen at
0.525. These were **LLM-adjudicated (me), not hand-verified in run 1** — flagged for spot-check:

| Query | Matched deposit query | Label | Note |
|---|---|:--:|---|
| How Long Is the Validity of CMMC Certification? | How long does the CMMC compliance **process** take? | FALSE | duration ≠ validity |
| How Long Is the Validity of CMMC Certification? | How long is my CMMC certification **valid**? | TRUE* | *matched deposit is a **placeholder** (that query hit in run 1, never derived) — a sweep artifact; the *match* is correct but the served content is empty |
| How much does CMMC compliance **cost**? | How long does the compliance **process** take? | FALSE | cost ≠ duration |
| What Are the CMMC **Requirements**? | What **Is** the CMMC Required by the DoD? | FALSE | enumeration ≠ definition |
| What's the **deadline** to get compliant? | How long does the **process** take? | FALSE | date ≠ duration |

Interesting: raising the threshold *rerouted* q43 ("validity") from a false match
(how-to-certify) to the semantically-correct validity question — but only because that question
had by then been force-deposited as a placeholder. In a real high-threshold run it would carry
the real answer; here it inflates high-threshold precision by one and is flagged as such.

---

## 4. Recommendation

**Do not treat the threshold as the precision fix.** The honest options:

- **Keep ~0.525** and accept 33% false-HR — unacceptable for a trust product.
- **Raise to 0.65** → false-HR 0, precision 0.80, but TP rate collapses to 0.091 (4/44, one a
  placeholder). You save almost nothing to buy precision. And 0.575–0.60 is a *trap* — precision
  dips before it recovers.
- **Build a question-type / intent gate** (recommended). Extend the existing deterministic
  intent-guard (`agreement.py`, today polarity-only) with an **interrogative-facet** check:
  classify each query's answer-type (definition / duration / cost / date-deadline / validity /
  who-scope / how-to) from the query prose, and refuse to serve across a facet mismatch even at
  high similarity — exactly how implicit-scope already gates `rust` vs `css`. That directly kills
  the observed false hits (`deadline`↔`who`, `cost`↔`duration`, `validity`↔`how-to`) without
  sacrificing recall, because it separates on the axis the false hits actually differ on.

---

## 5. THREATS TO VALIDITY — read loudly

- **The sample is tiny: n=44, 15 hits, 5 false, 7 true.** The separability read rests on
  comparing a **5-point** false distribution to a **7-point** true distribution. This is
  *directional evidence*, not a proven inseparability. One re-adjudication moves it.
- **But the mechanism is robust to sample size.** The false hits are demonstrably a *question-
  type* confusion (different interrogatives, same topic) — that's a structural property of
  embedding similarity, not a sampling fluke. The *magnitude* of the recall cost is uncertain;
  the *direction* (a cutoff can't separate question-types) is the safer conclusion.
- **Placeholder artifacts at high threshold.** Queries that hit in run 1 were never derived; when
  they miss at higher thresholds they deposit a placeholder, so a few high-threshold "true"
  matches match empty content (flagged in §3). This slightly **inflates** precision at 0.65+.
- **New pairs are LLM-labeled, not hand-verified** (§3) — one is a flagged placeholder-TRUE.
- **Single vertical, single rater**, same caveats as `reports/organic.md`. A broader set could
  shift where the distributions sit, but the overlap structure is the finding.
- **Zero token spend confirmed:** no `SearchProvider` constructed; 28 cached answers reused;
  `RRSRCH_PROVIDER=none` for the whole sweep.

_Exit criteria: (1) 7-point sweep table with precision/recall/false-HR — ✅; (2) TRUE-vs-FALSE
distributions + separable/not-separable verdict — ✅ (NOT separable); (3) zero token spend, new
pairs flagged LLM-labeled — ✅; (4) this report with verdict + small-sample caveat — ✅._
