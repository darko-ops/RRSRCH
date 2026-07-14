# Cross-encoder reranker — build + honest A/B on a real question-equivalence eval set

**Run:** 2026-07-03 · MiniLM bi-encoder + local cross-encoders (CPU, no API tokens) ·
**zero derivations, zero provider calls** (`provider="none"` throughout; matching only) ·
code `src/rrsrch/matching/rerank.py`, serve path `corpus._select_reranked` ·
eval `eval/equivalence_questions.json` + `eval/equivalence_pairs.json` ·
harness `scripts/reranker_ab.py` · raw results `reports/reranker_ab.json`.

**Headline, stated up front: the win condition was NOT met.** The reranker
demolishes today's 0.525 operating point — but so does simply raising the fused
threshold, and on the held-out test slice the strict threshold sits on or above
the reranker's precision/recall frontier. The reranker ships **off by default**
(`reranker="none"`), fully built and calibrated, behind the same kind of
swappable interface as the embedder. The eval set — the artifact that outlives
this experiment — is the real deliverable, and it reveals the production serve
decision is substantially worse than the 5-false-hit pilot suggested.

---

## 1. The eval set (Phase 1) — composition, provenance, not-rigged confirmation

### 1.1 Questions: 188 unique, verbatim, from 11 independent origins

| # | Origin | Kind | Questions |
|--|---|---|--:|
| 1 | Kelser Corp — common CMMC compliance questions | MSP blog (pilot source) | 8 |
| 2 | Charles IT — DoD CMMC FAQs | MSP blog (pilot source) | 11 |
| 3 | Forvis Mazars — C3PAO perspective FAQ | C3PAO (pilot source) | 7 |
| 4 | Exostar — top 10 webinar questions | Platform vendor (pilot source) | 10 |
| 5 | CMMC.com — certification/requirements/costs FAQ | Portal (pilot source) | 18 |
| 6 | **DoD CIO — official CMMC Program FAQ (Rev 2, Sept 2025)** | **Regulator (PDF, archived)** | 29 |
| 7 | IBSS Corp — C3PAO & certification FAQ | C3PAO | 8 |
| 8 | Cherry Bekaert — CMMC 2.0 compliance FAQs | Audit/advisory | 13 |
| 9 | Sentar — CMMC FAQ | Defense contractor | 9 |
| 10 | databrackets — CMMC certification FAQs | Assessor/consultant | 45 |
| 11 | PreVeil — top questions from 5,000+ DIB companies | Product vendor | 32 |

All questions were taken **verbatim** (URLs and fetch dates in
`eval/equivalence_questions.json`); none were authored, edited, deduplicated
across sources (one exact cross-source duplicate is kept once and noted), or
ordered. Cross-source repetition is the genuine domain phenomenon under test.

### 1.2 Pairs: 1,195 labeled, pooled from BOTH systems

Candidate pairs were pooled TREC-style so the eval isn't biased toward either
system under test: **P1** = every pair with fused similarity ≥ 0.50 (exhaustive
over the decision region; 806 pairs), **P2** = per-question top-5 by
cross-encoder score among pairs fused 0.30–0.50 (candidates the bi-encoder
underscores; 389), **P3** = the run-1 hand-adjudicated pairs. 967 of 1,195 are
cross-origin.

### 1.3 Labeling protocol (LLM labels — flagged loudly)

- **Blind:** 20 shuffled batches labeled by independent LLM agents (Fable 5)
  that never saw any similarity score — labels cannot anchor on the models
  under test. Rubric with worked examples from the run-1 hand set
  (MATCH / PARTIAL / NO_MATCH on answer-interchangeability; uncertain → step down).
- **Adversarial verify:** every proposed MATCH re-attacked by a refuter agent
  (45 → 39 confirmed, 6 demoted to PARTIAL, 0 to NO_MATCH).
- **Missed-positive sweep:** all 204 PARTIAL/NO_MATCH pairs with CE ≥ 0.90 or
  fused ≥ 0.62 re-reviewed (202 kept, 2 promoted to PARTIAL, 0 to MATCH).
- **Hand labels override:** the 19 run-1 hand-adjudicated pairs (judged against
  actually-served claims) win on conflict. Inter-rater check: fresh blind LLM
  labels agreed on **14/19**; all 5 disagreements were the LLM being MORE
  conservative (PARTIAL where hand said MATCH ×4 / NO_MATCH ×1). Both labels
  are recorded per pair.
- Every pair carries `labeler` provenance; **no pair was silently scored** —
  the retrieval simulation prints any served-but-unlabeled pair for
  adjudication (final run: zero).

Final labels: **42 MATCH, 105 PARTIAL, 465 NO_MATCH** in-slice (plus 583
excluded cross-slice pairs, see below).

### 1.4 Split: group-aware, tuned-on-cal-only

Connected components over MATCH edges (paraphrase clusters) never straddle the
split; a pair belongs to a slice only if BOTH endpoints do. **Calibration: 317
pairs (21 MATCH / 63 PARTIAL / 233 NO_MATCH). Held-out test: 295 pairs (21 / 42
/ 232). 94/94 questions.** All thresholds, the model choice, and the veto floor
were tuned on the calibration slice only.

### 1.5 Not-rigged confirmation

I did not author, reword, or select questions to create or avoid overlaps; the
pair pool is exhaustive above fused 0.50 (nothing cherry-picked); labels were
score-blind and adversarially verified with all demotions/promotions recorded;
hand labels from the earlier run override mine; the split is group-aware and
the test slice was never used for tuning. Residual risks are in §6.

---

## 2. What was built (Phase 2)

- `matching/rerank.py`: `Reranker` protocol (mirrors `Embedder`),
  `CrossEncoderReranker` (local, CPU; `activation` knob because STS models emit
  [0,1] natively while relevance models emit logits; optional **veto model**
  composed via `apply_veto` — one scoring path, `score_pairs`, shared by the
  serve path and the eval harness so scales can never diverge), `FakeReranker`
  for tests.
- `corpus.search()` refactored into `_select_fused` (byte-equivalent to the old
  path) and `_select_reranked`: bi-encoder retrieval and the deterministic
  scope gates unchanged → polarity/predicate (and optionally facet) intent
  guard still vetoes BEFORE the model → cross-encoder scores the survivors →
  serve iff rerank score ≥ `rerank_threshold`. The rerank score replaces the
  fused-cosine threshold as the match signal and nothing else — the
  confidence/trust/stale/explore pipeline is untouched (pinned by
  `tests/test_rerank.py::test_stale_confidence_still_deterministic_on_rerank_path`).
- Config: `reranker` (default **"none"** — production behavior unchanged),
  `rerank_model`, `rerank_activation`, `rerank_veto_model`, `rerank_veto_floor`,
  `rerank_threshold`, `rerank_top_k`, `facet_gate` toggle.
- **151 tests pass on BOTH stores** (memory + Postgres); ruff + mypy clean; the
  suite never loads the cross-encoder (FakeReranker only).

### 2.1 Model selection (calibration slice only)

| Cross-encoder | Task it was trained for | cal AUC | cal recall @ FP=0 (gated) |
|---|---|--:|--:|
| ms-marco-MiniLM-L-6-v2 (task-spec default) | query→passage relevance | 0.603 | unreachable |
| quora-distilroberta-base | duplicate questions (QQP) | 0.795 | 2/21 |
| quora-roberta-base / -large | duplicate questions (QQP) | 0.836 / 0.837 | 2/21 / 3/21 |
| nli-deberta-v3-base (bidirectional min-entailment) | NLI | 0.775 | 0/21 |
| **stsb-roberta-base (chosen primary)** | semantic similarity | **0.873** | **5/21** |
| stsb-roberta-large | semantic similarity | 0.890 | 1/21 |
| ensembles (means of the above) | — | ≤0.897 | ≤5/21 |

The suggested ms-marco model **fails structurally** in a single vertical: every
CMMC question is "relevant" to every other, so a passage-relevance score cannot
separate same-question from same-topic (its zero-FP point does not exist on the
calibration slice). STS (same-meaning) is the right objective and was chosen;
the QQP model — too strict alone (true paraphrases score 0.01–0.3) — was added
as a low-floor **veto** (kill if QQP < 0.13), which on calibration raised
recall at ≤1 false hit from 6/21 to 8/21. Operating points calibrated on cal:
fused strict T = 0.71; reranker R = 0.804 (fp0 rule) / 0.706 (fp1 rule).

---

## 3. The A/B on the HELD-OUT test slice (Phase 3)

### 3.1 Pair mode — the decision function on 295 labeled pairs (21 positives)

| Config | served | TP | PARTIAL | FP | precision (strict) | **false-hit rate** | **recall** |
|---|--:|--:|--:|--:|--:|--:|--:|
| (a) fused @ **0.525 (today's prod)** | 136 | 18 | 24 | **94** | 0.132 | **0.691** | 0.857 |
| (b) fused @ 0.525 + gates (facet on) | 111 | 17 | 23 | 71 | 0.153 | 0.640 | 0.810 |
| (a′) fused @ 0.71 (strict, cal-calibrated) | 16 | 8 | 6 | 2 | 0.500 | **0.125** | **0.381** |
| (c) stsb @ 0.804 (cal fp0) | 8 | 4 | 0 | 4 | 0.500 | 0.500 | 0.190 |
| (c) stsb+veto @ 0.804 (cal fp0) | 6 | 4 | 0 | 2 | 0.667 | 0.333 | 0.190 |
| (c) stsb+veto @ 0.706 (cal fp1) | 9 | 7 | 0 | 2 | **0.778** | 0.222 | 0.333 |

Note the pair distribution is deliberately **enriched-hard** (exhaustive
near-threshold negatives), so these rates are decision-function quality, not
traffic rates.

### 3.2 Retrieval mode — leave-one-out through the real `Corpus.search()`
(94-question test corpus; 30 queries have a true match available)

| Config | served | TP | PARTIAL | FP | precision (strict) | **false-hit rate** | **recall (questions)** |
|---|--:|--:|--:|--:|--:|--:|--:|
| (a) fused @ 0.525, no guard | 55 | 18 | 11 | 26 | 0.327 | **0.473** | **0.600** |
| (b) fused @ 0.525 + gates | 54 | 18 | 12 | 24 | 0.333 | 0.444 | 0.600 |
| (a′) fused @ 0.71 strict | 18 | 12 | 4 | **2** | 0.667 | **0.111** | 0.400 |
| (c) stsb+veto @ 0.706 (cal fp1) | 15 | 11 | 1 | 3 | 0.733 | 0.200 | 0.367 |
| (c) stsb+veto @ 0.804 (cal fp0) | 8 | 6 | 0 | 2 | 0.750 | 0.250 | 0.200 |

### 3.3 Threshold curve (test, stsb+veto, gated) — the calibration curve generalized

| R | served | TP | FP | false-hit | recall |
|--:|--:|--:|--:|--:|--:|
| 0.02 (floor of curve) | 17 | 10 | 5 | 0.294 | **0.476 ← veto's recall ceiling** |
| 0.618 (best test point, FP≤2) | 10 | 8 | 2 | 0.200 | 0.381 |
| 0.706 (cal fp1 ← shipped default) | 9 | 7 | 2 | 0.222 | 0.333 |
| 0.804 (cal fp0) | 6 | 4 | 2 | 0.333 | 0.190 |

Full curves for every config: `reports/reranker_ab.json`.

---

## 4. Verdict — honest, three parts

**1. Against today's production operating point, everything wins.** The eval's
most consequential number is (a) @ 0.525: **false-hit rate 0.47 (retrieval) /
0.69 (pairs)** on genuinely independent cross-source questions. The organic
pilot's 33% was not an outlier; it was optimistic. The paraphrase-tuned 0.525
threshold is the problem.

**2. Against the honest baseline — a strict threshold — the reranker loses the
win condition.** The task's bar was: false hits toward 0 while holding recall
*meaningfully above* the strict-threshold cutoff. On held-out data the strict
fused threshold (0.71, calibrated on cal by the same rule) gives retrieval
false-hit 0.111 at recall 0.400; the calibrated reranker gives 0.200 at 0.367 —
**on or below the strict-threshold frontier, on both axes**. In pair mode at
equal FP (=2), both recover 8 true positives, but the threshold also serves 6
useful PARTIALs where the reranker serves none. The reranker's only clear win
is strict precision (0.733–0.778 vs 0.5–0.667) — it serves fewer wrong-ish
things but also fewer right things, at the cost of two extra models per query.

**3. Why: the residual failure class defeats cross-encoders too.** The
stubborn test false positives are **lexically-twinned different questions** —
"How Long Does a CMMC Level 2 Certification **Assessment** Take?" vs "How long
is a CMMC Level 2 certification **valid**?" scores **0.96** under STS (surface
meaning nearly identical), while genuine cross-worded paraphrases ("Why Is
There a Need to Create the CMMC?" ~ "What is the purpose of CMMC?") score
**0.55**. Those two facts together mean NO threshold on this model family can
have both. The QQP veto kills some twins but its floor also **zeroes 11 of 21
true paraphrases** (recall ceiling 0.476) — QQP-duplicate is stricter than
"same question". This is the same subject-vs-shape confusion the facet-gate
report identified; off-the-shelf cross-encoders do not solve it.

### Is the facet gate still needed?

Under the reranker: **no effect at all** — facet-on and facet-off curves are
identical at every threshold (the pairs the facet gate rejects score below any
sane rerank threshold anyway; the reranker subsumes it). On the baseline path
it still contributes marginally (retrieval FP 26 → 24). Since the reranker
ships off by default, **the facet gate stays** on the production path.

### What ships, and the recommendation

- Reranker: built, tested, calibrated, **default off**. `RRSRCH_RERANKER=local`
  enables the full calibrated stack (stsb + QQP veto @ 0.706) for anyone who
  values strict precision over recall.
- **The cheap, evidence-backed win is raising `similarity_threshold` toward
  ~0.65–0.71** (retrieval false-hit 0.111 @ 0.71 vs 0.473 @ 0.525). Left as a
  deliberate follow-up decision since it trades away half of today's raw hits.
- The demonstrated path to actually beating the frontier is a **fine-tuned
  pair classifier on domain question pairs** (this eval set is the seed
  training/eval corpus) and/or the deterministic subject/entity-overlap axis
  from the facet-gate report — both attack the lexically-twinned class head-on.

---

## 5. THREATS TO VALIDITY — read loudly

- **21 positives per slice.** Every recall figure has ±1-hit granularity of
  ~5 points. The cal→test swing of the fused baseline's recall (0.143 → 0.381
  at the same threshold) shows exactly this slice noise. Differences of 1–2
  hits between configs are NOT conclusive; the *direction* (reranker does not
  dominate) is consistent across both modes and both operating rules.
- **LLM-proposed labels.** All fresh labels are Fable-5-proposed (blind,
  batched, adversarially verified) and flagged per-pair; only 19 pairs carry
  hand labels. The 5/19 hand-LLM disagreements all ran conservative, so the
  positive set may be slightly under-inclusive — this depresses every config's
  recall equally but could shift frontier crossings. A human spot-check of
  `eval/equivalence_pairs.json` (start with `labeler != hand-run1` MATCHes and
  the `hand_vs_fresh_llm.disagreements` block) is the single highest-value
  review.
- **Label subjectivity at the margin.** MATCH-vs-PARTIAL for level-scoped pairs
  ("cert valid" vs "L2 cert valid") is judgment; the rubric's step-down rule
  biases toward PARTIAL, which strict metrics count as non-serves.
- **Mild test contamination in the design loop.** The model swap (ms-marco →
  stsb) was decided on calibration data, but the *decision to also report the
  fp1 operating rule* came after observing that fp0 didn't generalize on test.
  All configs are reported at both rules; nothing was re-tuned on test.
- **Enriched-hard pair distribution.** Pair-mode rates are not traffic rates
  (the pool over-represents near-threshold negatives by construction).
  Retrieval mode corrects the serve-selection effect but still uses FAQ-head
  questions, which overstate overlap density vs long-tail traffic.
- **Single vertical (CMMC), English, FAQ register** — same caveat as every
  prior report in this series.
- **Veto floor + threshold are 2 knobs tuned on 21 cal positives** —
  overfitting risk is real; the veto's test recall ceiling (0.476) is itself
  evidence the floor doesn't transfer perfectly.

---

## 6. Exit criteria status

1. Real, provenance-tagged, calibration/test-split eval set — **✅** (188
   verbatim questions, 11 independent origins incl. the DoD CIO regulator FAQ;
   1,195 labeled pairs; group-aware split; labels flagged by labeler).
2. Cross-encoder reranker behind a swappable interface; deterministic trust
   pipeline untouched; both stores green (151 passed × 2); ruff+mypy clean;
   unit tests model-free — **✅**.
3. Held-out A/B showing the reranker beats baseline AND gates AND the
   high-threshold cutoff — **❌ NOT MET, and reported as such.** It beats the
   production 0.525 configuration decisively but does not dominate the strict
   fused threshold on the precision/recall frontier. The reranker therefore
   ships default-off.
4. This report with the not-rigged confirmation and threats — **✅**.
