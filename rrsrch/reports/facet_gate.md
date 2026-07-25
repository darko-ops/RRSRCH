# Interrogative-facet gate — build + captured-sweep A/B

**Run:** 2026-07-03 · same captured Phase-A stream (44 queries) · Postgres + MiniLM ·
**zero new derivations** (run-1 answers reused; no `SearchProvider` constructed) ·
gate in `agreement.py` (`_extract_facet` + `intent_verdict`) · A/B harness
`scripts/facet_sweep.py` · raw `reports/facet_sweep.json`.

## What was built

A deterministic **interrogative-facet** axis on the ONE shared extractor:
- `ClaimFields.facet: str | None` — populated by `_extract_facet()` in `RegexExtractor`
  (the same extractor the serve path already uses; **no second extraction path**).
- Facets are only the sharp **parametric answer-shapes**: `who` / `when` / `duration` /
  `cost` / `quantity` / `how-to`. Descriptive questions (`what-is`, `why`, `whether`,
  `difference`, `what-happens`) return **None** = no gate.
- `intent_verdict` rejects a candidate when **both** facets are determined and differ
  (`rule=facet_mismatch:X!=Y`) — even at similarity 0.97, exactly like an implicit-scope
  conflict. Undetermined on either side ⇒ fall through to similarity.
- Tests `tests/test_facet_gate.py` (7): synonym normalization, the **over-gating pin**
  (all 7 true hits still match; duration paraphrase agrees), cross-facet rejects, the
  documented enclave/CUI limitation. Full suite **140 passed** on **both** stores;
  ruff + mypy clean.

## The A/B table (gate OFF vs ON), reusing cached answers

| config | served | T | P | F | precision (T/served) | **TP rate** (T/44) | **false-HR** (F/served) |
|---|---:|--:|--:|--:|---:|---:|---:|
| OFF @ 0.525 | 15 | 7 | 3 | 5 | 0.467 | **0.159** | **0.333** |
| **ON @ 0.525** | 13 | 7 | 2 | 4 | **0.538** | **0.159** | **0.308** |
| OFF @ 0.60 | 12 | 5 | 1 | 6 | 0.417 | 0.114 | 0.500 |
| **ON @ 0.60** | 9 | 6 | 1 | 2 | **0.667** | **0.136** | **0.222** |

## Did it work? Partially — and honestly.

**The one thing that fully worked: no over-gating.** At 0.525 the TP rate is **unchanged
(0.159 → 0.159): all 7 true hits survive the gate.** The pinned regression test enforces
this. Recall was not sacrificed — the primary risk is retired.

**The cross-facet false hits it was built for: killed.** At 0.525 the gate turned the two
`who`-confusions into correct misses:
- ✓ `"What's the deadline…"` (when) ✗ `"Who needs to comply…"` (who) → **rejected → miss**
- ✓ `"What should we do to prepare…"` (how-to) ✗ `"Who needs to comply…"` (who) → **rejected → miss**

**But net precision moved only modestly (false-HR 0.333 → 0.308 at 0.525),** because killing a
serve is not free — it becomes a miss→deposit, which reshapes the corpus. Full ledger,
OFF→ON at 0.525:

| # | query | OFF | ON | what happened |
|--|---|--|--|---|
| 21 | What's the deadline…? | FALSE | — | **eliminated** → correct miss (when≠who) |
| 26 | What should we do to prepare…? | FALSE | — | **eliminated** → correct miss (how-to≠who) |
| 36 | How long is my cert **valid**? | FALSE | FALSE | **rerouted**: cross-facet match blocked, fell to `how long does the assessment take` — *same facet (duration), different subject* → still false |
| 43 | How Long Is the **Validity**…? | FALSE | FALSE | **rerouted**, same as #36 |
| 39 | What is a CUI **enclave**? | FALSE | FALSE | **untouched** — both `None` facet (subject mismatch, not facet) |
| 40 | What Are the **Requirements**? | PARTIAL | FALSE | **regression (densification)**: the gate deposited the now-missed deadline query, which then out-ranked the old partial match |

Net at 0.525: **2 false genuinely eliminated, 2 rerouted (still false), 1 untouched, 1
partial→false regression → false count 5 → 4.**

## Verdict: the facet gate is necessary but **not sufficient**

It correctly and deterministically fixes the **cross-facet** confusion class (who vs
deadline vs how-to) with **zero recall cost** — that class is real and now closed. But the
sweep exposes two residual classes a cosine cutoff *and* a facet gate both miss:

1. **Same-facet, different-SUBJECT** — `cert validity` vs `assessment duration` (both
   `duration`); `CUI enclave` vs `CUI` (both `None`). The answer-*shape* matches; the
   *subject* doesn't. This needs a **subject/entity-overlap axis**, not a facet — and the
   machinery already exists (`ClaimFields.entities`, `scope.infer`). **This is the clear
   next step.**
2. **Densification** — every rejected serve becomes a deposit, and a wrong-but-similar
   deposit can become a new false match later (#40). Higher thresholds suppress this
   (ON @ 0.60 is cleaner: false-HR 0.222, TP *up* to 0.136), suggesting facet-gate + a
   modestly higher threshold + a subject gate is the combination to test next.

## Overfitting / honesty flags

- **I did NOT invent a facet to catch enclave/CUI (false #39)** or the validity/assessment
  reroute — those are subject mismatches, and fabricating a facet for n=1 would be
  overfitting. They are reported as residual, not hidden.
- **`validity` was merged into `duration`** (not a separate facet) — the coarser, anti-
  overfit choice; no labeled pair needed them split. A larger set may justify splitting.
- **3 new pairs surfaced by the gate were LLM-adjudicated (me), not hand-verified**, and
  flagged as such in `facet_sweep.py`. One matched deposit is placeholder content (that
  query hit in run 1, never derived) — the false verdict rests on the *subject* mismatch,
  which holds regardless of content, but it is flagged.

## THREATS TO VALIDITY — read loudly

- **n=44, 5 false, 7 true is TINY.** Every number here is directional. The gate is
  **validated, not proven**: 7/7 true preserved and the cross-facet kills are structural
  (deterministic on the interrogative), but the *net* false-HR (0.308) rests on ~4 false
  hits — a single re-adjudication moves it materially.
- **The facet cue lexicon is tight but unproven at scale.** `\bwhen\b`/`\bwho\b` can fire
  mid-sentence on a non-interrogative use; the asymmetry protects correctness (a false
  reject just re-derives) but could cost recall on traffic we haven't seen.
- **Densification is real and will vary with corpus size** — its precision drag is a
  property of this small, dense set and may look different at n≥150.
- **Single vertical, single rater**, same caveats as `reports/organic.md` /
  `reports/threshold_sweep.md`.
- **Zero token spend confirmed:** no `SearchProvider` constructed; cached answers reused;
  `RRSRCH_PROVIDER=none` throughout.

## Bottom line

The interrogative-facet gate is the **right first axis** and ships clean (deterministic, one
shared extractor, 140 tests + ruff + mypy green, no over-gating). It closes the cross-facet
false-hit class at zero recall cost. It is **not the whole fix**: the dominant residual is
**same-subject vs different-subject** confusion, which a facet cannot see. **Recommended next:
a deterministic subject/entity-overlap gate on the same shared fields**, then re-run this exact
A/B — that is the axis the remaining false hits actually differ on.

_Exit criteria: (1) deterministic facet gate, one shared extractor, no second path, ruff+mypy
clean, both stores green — ✅; (2) re-run at 0.525: false-HR down (0.333→0.308) WITHOUT
collapsing TP (0.159 held, 7/7 true preserved) — ✅ (modest, honestly reported); (3) zero token
spend, new pairs flagged LLM-labeled — ✅; (4) this report with gate-on/off + caveats — ✅._
