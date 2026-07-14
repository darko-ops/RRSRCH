# Organic hit rate + measured savings — Phase A pilot (CMMC vertical)

**Run:** 2026-07-03 · Postgres + MiniLM (`all-MiniLM-L6-v2`) @ fused threshold **0.525** ·
isolated empty DB `organic` · harness `scripts/organic_replay.py` · raw data
`reports/organic_run.json`, capture table `organic.captured_queries`.

**This is a PILOT (44 questions).** It exists to validate the method honestly and see the
early curve before committing a larger spend — not to publish a final business number.
Every headline here is small-sample; see Threats to Validity.

---

## 1. Provenance — the question set (independently sourced, NOT overlap-engineered)

44 questions were replayed (of 54 sourced). Each was taken **verbatim** from a public
FAQ/webinar page, authored **independently by a different organization**. I did not write
any question, did not dedupe, and did not order them to create overlaps. Arrival order is a
**neutral round-robin interleave** across the five sources (one per source per round; see
`interleave()` in the harness) — deliberately *not* clustered by topic.

| Source (independent origin) | URL | Used / sourced | Hits |
|---|---|---:|---:|
| Kelser Corp — "8 Most Common CMMC Compliance Questions" | kelsercorp.com/blog/most-common-cmmc-compliance-questions-contractors-ask | 8 / 8 | 5 |
| Charles IT — "DoD CMMC FAQs: Questions Answered" | charlesit.com/blog/dod-cmmc-faqs-questions-answered | 10 / 11 | 6 |
| Forvis Mazars — "C3PAO Perspective FAQ on CMMC Readiness" | forvismazars.us/forsights/2025/7/an-faq-c3pao-perspective… | 7 / 7 | 1 |
| Exostar — "Top 10 Questions from our CMMC Readiness Webinar" | exostar.com/blog/…/answering-the-top-10-questions… | 10 / 10 | 1 |
| CMMC.com — "CMMC FAQ: Certification, Requirements & Costs" | cmmc.com/faq | 9 / 18 | 2 |

**Confirmation the set was not overlap-engineered.** The overlap the flywheel exploits is a
property of the *domain*: five different organizations, writing FAQs for the same regulation,
independently ask the same underlying questions in different words. Examples of **genuine
cross-source repetition** (different authors, no coordination):
- Charles IT "How Do You Get CMMC Certification?" ↔ CMMC.com "How do I get CMMC certified?"
- Charles IT "How Long Is the Validity of CMMC Certification?" ↔ Kelser "How long is my CMMC certification valid?"
- Forvis Mazars "…Level 2 assessment with a C3PAO, or…self-assessment?" ↔ Kelser "Do we need a C3PAO assessment or is a self-assessment enough?"

**Excluded (documented, not silently dropped):** 4 vendor-product-promo items from cmmc.com
("How does Secureframe assist…", etc.) — not domain research questions. See
`eval/organic_questions.json` → `excluded`.

---

## 2. Method (temporal, real derivations)

- Corpus starts **empty**; harness `TRUNCATE`s all corpus tables at start → a query can only
  hit deposits that arrived **before** it, in this run. **Strictly sequential** — no look-ahead.
- On **hit**: served from cache; warm cost = measured served tokens (claim + sources).
- On **miss**: a **real** web+LLM derivation via `providers.py` `WebSearchProvider`
  (`claude -p … --allowedTools WebSearch,WebFetch`). The **actual** `usage` tokens are
  recorded as measured cold cost; the real answer is deposited so later questions can hit it.
- Corpus built with **no inline exploration provider**, so hits are pure warm serves (no
  hidden token spend confounds the savings).
- **28 real derivations** ran (147,912 measured cold tokens total). **1 derivation failed**
  (q33, `claude` CLI exit 1) — recorded as `derivation_failed`, no deposit; it neither hit nor
  polluted the corpus.

---

## 3. Organic hit rate — RAW vs precision-adjusted

> The engine's "served" ≠ "correct." The raw rate is what the engine served; the adjusted
> rate is what it served *correctly* (§5). Both are reported; the adjusted one is the honest
> business number.

| Metric | Value |
|---|---|
| **Raw overall hit rate** | **34.1%** (15/44) |
| Raw shared-world hit rate | 35.7% (15/42) |
| Precision (strict / lenient) | **46.7%** (7/15) / 66.7% (10/15) |
| **False-hit rate** | **33.3%** (5/15) |
| **True-positive organic hit rate (strict)** | **15.9%** (7/44) · shared-world 16.7% (7/42) |
| True-positive organic hit rate (lenient) | 22.7% (10/44) · shared-world 23.8% (10/42) |

Only 2 of 44 queries were **private-context** (classifier flagged both correctly: "What does
your backlog look like?" and the Exostar-SPRS question) — so on FAQ traffic the shared-world
subset ≈ the whole set. That is itself a finding (Threats §7).

**Read this as: ~1 in 3 organic "hits" was a wrong answer.** The honest organic hit rate on
this pilot is **~16–23%**, not 34%.

---

## 4. Flywheel curve — does it bend up? (yes)

Raw hit rate vs queries processed (corpus grows as misses deposit):

```
q  1– 8 : 0%     corpus filling, every query a miss → real derivation
q12      : 16.7%  (corpus=10)
q16      : 25.0%  (corpus=12)
q20      : 25.0%  (corpus=15)
q24      : 29.2%  (corpus=17)
q28      : 32.1%  (corpus=19)
q32      : 31.3%  (corpus=22)
q40      : 35.0%  (corpus=25)
q44      : 34.1%  (corpus=28)
```

The curve **bends up** from 0 and settles ~30–35% raw as independent questions accumulate —
the mechanism works on real traffic. It is still climbing/plateauing at n=44; where it
asymptotes is unknown at this sample size. (Precision-adjusted, the *correct*-serve curve
would sit ~⅓ lower.)

---

## 5. Verification sample — all 15 hits, manually adjudicated

Each served claim was read against the asking question. **V** = correct, **P** = partial, **✗** = false hit.

| # | Query | Served answer was for | sim | Verdict |
|--:|---|---|--:|:--:|
| 11 | Do we need a C3PAO assessment or is a self-assessment enough? | …Level 2 assessment with a C3PAO, or self-assessment? | 0.72 | **V** |
| 12 | What Is the CMMC Required by the DoD? | What is the purpose of CMMC? | 0.56 | **V** |
| 15 | What are the penalties for CMMC non-compliance? | What happens if we don't meet CMMC requirements? | 0.63 | **V** |
| 16 | How long does the CMMC compliance process take? | How long does a CMMC L2 assessment take? (claim covers journey) | 0.58 | **V** |
| 22 | Why Is There a Need to Create the CMMC? | What is the purpose of CMMC? | 0.68 | **V** |
| 32 | What Is the Difference Between DFARS and CMMC? | Why is DoD switching from DFARS to CMMC? | 0.62 | **V** |
| 37 | How Do You Get CMMC Certification? | How do I get CMMC certified? | 0.83 | **V** |
| 19 | When was CMMC introduced, and current rollout timeline? | When was CMMC released? (gave intro dates, not rollout) | 0.69 | P |
| 28 | Do I need to be preparing for CMMC Level 3? | What CMMC level does my business need? | 0.53 | P |
| 40 | What Are the CMMC Requirements? | What CMMC level does my business need? (has requirement content) | 0.58 | P |
| 21 | What's the **deadline** to get CMMC compliant? | **Who needs to comply** with CMMC? | 0.57 | **✗** |
| 26 | What should we do now to **prepare**? | **Who needs to comply** with CMMC? | 0.60 | **✗** |
| 36 | How long is my CMMC certification **valid**? | **How to get** certified (no validity period) | 0.62 | **✗** |
| 39 | What is a CUI **enclave**? | What is **CUI**? (never defines enclave) | 0.62 | **✗** |
| 43 | How Long Is the Validity of CMMC Certification? | **How to get** certified (no validity period) | 0.58 | **✗** |

**Estimated precision: 47% strict (7/15), 67% counting partials (10/15). False-hit rate 33%.**

Two structural findings from the false hits:
1. **The 0.525 threshold is tuned for paraphrases, not independent traffic.** Genuinely
   different-but-topically-adjacent questions ("deadline" vs "who complies"; "CUI enclave" vs
   "CUI") embed at 0.53–0.62 and clear the bar. The intent-guard doesn't catch them — they are
   not polarity flips, just different questions.
2. **A false hit is self-perpetuating.** q36 ("certification validity") false-hit → it did not
   deposit → q43 (the *same* question from another source) had no correct deposit to hit and
   false-hit again on the same wrong answer. One false hit can suppress the very deposit that
   would have served its topic correctly.

---

## 6. Measured savings (real cold cost, not the 90k estimate)

The single biggest correction from real data:

| Quantity | Value | Note |
|---|---|---|
| **Measured cold cost / derivation** | **5,283 tokens** (mean; 28 derivations, 147,912 total) | vs the **90,000** default estimate — **~17× lower** |
| Warm serve cost / hit | 328 tokens (mean; 165–484) | richer claims than the ~82-tok minimal case |
| **Measured saving / hit** | **~4,917 tokens** (cold − warm) | real, per-hit |
| Cumulative saved — **raw** (15 hits) | 73,758 tokens | includes false hits (dishonest to claim) |
| Cumulative saved — **true hits only** (7) | **33,964 tokens** | the honest floor |
| Cumulative saved — true+partial (10) | 49,123 tokens | honest ceiling |

**Honest framing:** the win per correct hit is **~5k tokens (a ~94% cut, 5,283 → 328)** — real
and large in *ratio*, but the *absolute* per-hit saving is ~5k, not ~90k. Any savings claim
must (a) use the measured ~5k cold cost, and (b) count **only correct hits** — a false hit
"saves" tokens by serving a wrong answer, which is negative value, not savings.

---

## 7. Threats to validity

- **Sample size (n=44, 15 hits, 28 derivations).** Everything here is wide-error-bar. Precision
  47% is 7 of 15 — ±1 adjudication swings it several points. Treat as directional only.
- **Single vertical.** CMMC only. Overlap density in other verticals (or general research
  traffic) will differ — likely lower for less-standardized domains.
- **Source representativeness.** FAQ/webinar pages are *curated* common questions — they
  over-represent the head of the distribution, which **inflates** hit rate vs real long-tail
  agent traffic. Real traffic also carries far more **private-context** queries (here only 2/44);
  a realistic mix would lower the addressable rate.
- **Cold cost is workload-specific.** 5,283 tok/derivation reflects short factual CMMC lookups
  via `claude -p`. Deeper research tasks cost more; the ratio (not the absolute) is the
  transferable number, and even the ratio depends on claim length.
- **Precision is the binding constraint, not recall.** At threshold 0.525, 33% of hits were
  wrong. Raising the threshold would cut false hits but also cut the hit rate — the real Phase A
  question is the **precision-at-threshold curve**, which this pilot only samples at one point.
- **One derivation failed** (q33); a different corpus would have one more deposit. Negligible at
  this scale but noted.
- **Adjudication is single-rater (me).** Partials especially are judgment calls; an independent
  rater could shift strict precision ±1–2 hits.

---

## 8. Bottom line & recommended next step

On genuinely independent CMMC traffic, temporally sound: **raw organic hit rate 34%, but
precision only ~47%, so the honest correct-serve rate is ~16–23%**, with a measured **~94%
per-hit token cut on correct hits (5,283 → 328)**. The flywheel demonstrably bends up. The
gating problem is **precision at the paraphrase-tuned threshold**, and false hits are
self-perpetuating.

**Before scaling to 150+**, the highest-value follow-up is a **threshold sweep** (0.525 → 0.65 →
0.75) on this same captured set to plot precision/recall, because the business number is
correct-hit-rate = raw-rate × precision, and precision is currently the smaller factor. Then
re-run at n≥150 for tighter error bars.

_Exit criteria status: (1) real, temporally-sound organic hit rate on the shared-world subset
with verified precision — ✅; (2) flywheel curve from real traffic — ✅; (3) measured per-hit &
cumulative savings — ✅; (4) this report with provenance + threats — ✅. Scope caveat: pilot n=44,
not the final 150+._
