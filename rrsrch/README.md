# rrsrch — Phases 0+1: research memory that verifies itself

Agents waste enormous tokens re-deriving knowledge other agents already
established. **rrsrch** stores *distilled* results (a compact claim + sources) and
serves them when a similar question comes back — **only while the answer is still
trustworthy.** Phase 0 built the cache + deterministic confidence; **Phase 1 adds
Proof-of-Search**: a per-topic exploration bandit that steers a verification
budget toward uncertainty, observed volatility that overrides the depositor's
guess, a self-verification loop that catches stale answers with no agent in the
loop, a correction/recall feed, and a corroboration gate that survives negation
and paraphrase.

## The inviolable rule
Confidence, the serve-vs-research decision, the explore-vs-exploit decision, and
the corroboration agreement verdict are ALL **deterministic, auditable code**. An
LLM may distill sources, judge query similarity, and *extract* structured fields
from a claim — it never computes a score, never renders a verdict, never decides
what to trust. `confidence.py`, `exploration.py`, `agreement.py`, and `topics.py`
are pure modules; the rule is commented at the top of each.

## Run it
```bash
make up            # Postgres+pgvector + app (migrates on boot); /metrics on :8000
make test          # unit + end-to-end + exit-criteria tests (offline, no Postgres)
make test-pg       # the SAME suite against real Postgres (up + migrate first)
make eval          # the matching eval — prints the three exit numbers
make demo          # walk the 3 worked examples, print the savings report
make steering      # print the Phase 1 budget-flow curves (settled→floor, volatile→ceiling)
make verify-loop   # the self-verification worker (RRSRCH_PROVIDER=claude-cli)
make verify-live   # ONE real proof-of-search cycle against live web (costs tokens)
```

**Real-stack numbers** (Postgres + MiniLM, measured — not simulated):
[reports/real-stack.md](reports/real-stack.md). Headline: paraphrase hits
**96.7%** at the tuned fused threshold **0.525** (hash floor: 86.7%), scope
false-hits **0** at every threshold in the sweep, and one live proof-of-search
cycle that caught an outdated claim and superseded it with cited fresh research
in 34s, no agent, no human.

**Flywheel curve** (`make flywheel` → [reports/flywheel.md](reports/flywheel.md)):
hit rate vs corpus size on ground-truth-labeled Zipfian traffic (matcher-blind
paraphrases, sensitivity band s=0.8/1.0/1.2). Headline under Zipf(1.0):
**65.8% true-hit rate, precision 0.981, recall 0.846** at 400 queries — with the
observed false hits reported by cause, not assumed zero.

## Point an MCP client at it
The agent surface is the stdio command `rrsrch-mcp` (e.g. in Claude Code:
`claude mcp add rrsrch -- rrsrch-mcp`). Three tools:

- **`search(query, scope?)`** → `outcome` is one of:
  - `hit` — use the returned `claim` (with `confidence`, `age_seconds`, `sources`);
  - `stale` — the corpus knows this question but confidence has decayed:
    re-derive, then `corroborate(deposit_id, ...)` with what you found;
  - `miss` — re-derive, then `deposit()`.
- **`deposit(query, claim, sources, volatility_hint, scope?)`** → stores a
  distilled, cited result. `volatility_hint` (low|medium|high) sets its decay rate.
- **`corroborate(deposit_id, claim, sources?)`** → deterministic agreement check:
  **agreed** re-earns confidence to 1.0 (anchor moves to now, sources merged);
  **disagreed** retires the old deposit with `superseded_by` → your new claim.
  Errors don't persist: the next search returns the corrected claim.
- **`search(deposit_id=...)`** (lookup mode) → "is the answer I cached still
  alive?" If retired, you get `superseded_by` + the live `replacement`.
- **`recalls(since)`** → the correction feed: every retirement since the
  timestamp, as `{retired_deposit_id, superseded_by, topic_id, retired_at}` —
  poll it if you cache rrsrch answers elsewhere. Also `GET /recalls?since=`.

## The matcher (where the value is)
Hit rate is the whole value prop, so matching quality is the deliverable.
- **Hybrid retrieval:** lexical (`pg_trgm`) ∪ vector (pgvector cosine) candidates
  fetched **concurrently**, fused as `vector_weight·cosine + lexical_weight·lexical`,
  thresholded (conservative — a false hit is worse than a miss).
- **Scope is a hard gate, applied *before* similarity:** two near-identical queries
  with different scope (S3 price `us-east-1` vs `eu-west-1`, API `v3` vs `v4`) never
  match, no matter how similar. Retired deposits never enter the pool.
- **Implicit scope gates too (Phase 2):** the tech/language/platform a query is
  *about* lives in its prose and behaves exactly like declared scope. A tight,
  alias-normalized gazetteer (`k8s`==kubernetes, `Amazon S3`==s3) extracts tags
  at deposit time (`inferred_scope`) and search time; a subject swap on a shared
  dimension — or zero common subject across dimensions — rejects the candidate
  ("in Rust" never serves the CSS answer). No signal ⇒ no gate; unknown techs
  fall through to similarity. Flywheel-proven: false hits 5→0 at Zipf(1.0),
  precision 1.000, recall unchanged.
- **Intent guard, the LAST check before serving:** same-scope opposite-intent
  queries ("require X?" vs "NOT require X?", enable/disable, install/remove,
  increase/decrease, include/exclude, before/after) embed near-identically —
  similarity would serve the wrong answer. The guard compares polarity +
  antonym-predicate direction from the ONE shared Extractor (`agreement.py`) and
  rejects on any flip, even at similarity 0.97. Ambiguous ≠ mismatch: no signal on
  both sides falls back to similarity, so paraphrases still hit. Rejections are a
  miss (reason `intent_mismatch` in `no_serve_breakdown`) with full audit detail.

## Confidence (deterministic decay + corroboration)
```
anchor     = last_corroborated_at or created_at
volatility = topic.observed_volatility or deposit.volatility_hint
confidence = 0.5 ** (age_since_anchor / (half_life(volatility) × topic.half_life_factor))
serve      = confidence >= 0.70
```
Half-lives: low → months (180d), medium → days (3d), high → hours (6h). An
agreeing corroboration resets the anchor (confidence re-earned to 1.0); a
disagreeing one retires the deposit. All knobs are env config (`RRSRCH_*`):
thresholds, half-lives, fusion weights, bandit bounds, `COLD_PATH_ESTIMATE`.

## Proof-of-Search (Phase 1): the exploration bandit
Deposits cluster into **topics** (deterministic: exact scope partition + leader
embedding cosine, no random init). Each topic carries bandit state:

- **explore vs exploit** — on a cache hit, with probability
  `exploration_rate(topic)` rrsrch re-derives anyway (via a `SearchProvider`) and
  feeds the result into `corroborate()`. The RNG is injected (seedable in tests).
- **update rule** (pure code, bounded): agreement → rate decays toward the floor
  and the topic's half-life stretches; disagreement → rate grows toward the
  ceiling, half-life shrinks, and `last_verified_at` resets so the verifier
  returns immediately.
- **observed volatility** — the hint is a prior. Once a topic has ≥5
  corroborations, its own disagreement rate sets the half-life. A topic the
  depositor called "low" that keeps disagreeing decays like "high" on its own.
- **self-verification** — `verify_once()` ranks topics by
  `age_since_verified × exploration_rate` and corroborates the top N with a fresh
  derivation: stale answers get caught with **no agent and no human in the loop**.
  `verify_loop()` runs it forever (single-process async; no queue infra).

## Reading the savings report
`make demo` (or `GET /metrics` on the running app) prints:

- **`total_queries` / `hits` / `stale` / `misses`** — every `search()` is one query;
  corroborations are counted separately under `corroborations`.
- **`tokens_with_rrsrch`** — what the queries actually cost: tiny served claims for
  hits, the full `cold_path_estimate_tokens` (default 90k) for stale/miss (the
  caller re-derives).
- **`tokens_without_rrsrch`** — the counterfactual: every query derived cold.
- **`total_tokens_saved`** and **`reduction_pct`** — the money numbers. Each warm
  hit saves ~`cold_estimate − served_size` (≈89,970 of 90,000 tokens).
- **`no_serve_breakdown`** — why non-hits happened (`no_match`,
  `below_similarity_threshold`, `confidence_below_threshold`): this tells you which
  knob to tune.
- **`exploration`** — verification budget actually spent (it counts against the
  savings claim, honestly), plus per-topic flow under **`topics`**: each topic's
  `exploration_rate`, agree/disagree counts, observed volatility, and
  `explore_tokens` — the headline Phase 1 result is watching spend concentrate on
  high-disagreement topics and drain from settled ones (`make steering`).
- **`mean_time_to_correction_seconds`** — how long a staled answer lived past its
  serve threshold before a corroboration killed it.

## Current eval numbers
`make eval` deposits 30 paraphrase pairs (must hit the right deposit) + 10 scope
near-misses (must not match), and prints:

```
embedder=hash  similarity_threshold=0.42
1. paraphrase hit rate : 86.7%  (26/30)
2. scope false-hit rate: 0.0%   (0/10)
3. warm hit cost       : 30 tok = 0.03% of cold (90000)
✓ EVAL PASSED
```

> Those are the **offline floor** (in-memory store + deterministic hash embedder,
> no model download). The real numbers — measured on Postgres + MiniLM — are in
> [reports/real-stack.md](reports/real-stack.md): **96.7%** paraphrase hits at the
> tuned threshold. Reproduce with
> `RRSRCH_STORE=postgres RRSRCH_EMBEDDER=minilm RRSRCH_EVAL_SWEEP=0.35:0.95:0.025
> make eval` (the sweep prints the hit-rate curve and picks the knee; the tuned
> default 0.525 is already in config). Note the threshold applies to the FUSED
> score (0.7·cosine + 0.3·lexical), not raw cosine. Scope false-hits are 0 at
> every threshold — the hard gate is embedder-independent.

## The corroboration gate (hardened in Phase 1)
Pure lexical similarity false-agrees across a negation and false-disagrees on
paraphrases. Now: a deterministic extractor (regex by default; an LLM may
implement the same `Extractor` protocol — it only *proposes* fields) pulls
numbers, entities, and polarity from both claims, and **code** compares them:

1. polarity differs → **disagree** ("X is compliant" vs "X is not compliant")
2. numbers on both sides, any unmatched beyond tolerance → **disagree**
3. numbers all match → **agree** (paraphrases with the same figures pass)
4. strong entity overlap + moderate lexical → **agree**
5. nothing extracted → the conservative lexical fallback (≥ 0.90)

Both sides' fields and the rule that fired are logged (`query_events.detail`)
so every verdict is auditable.

## Layout
```
src/rrsrch/
  confidence.py   the pure trust engine (decay + corroboration anchor + topic factor)
  exploration.py  the bandit update rules (pure, bounded)
  agreement.py    claim extraction + the deterministic corroboration verdict
  topics.py       deterministic topic clustering (scope partition + leader cosine)
  verification.py SearchProvider interface · verify_once() · verify_loop()
  matching/       scope.py (hard gate) · lexical.py (trigram) · engine.py (hybrid fuse)
  store/          base.py (interface) · memory.py · postgres.py (pgvector+pg_trgm) · models.py · db.py
  mcp/            server.py (thin, 4 tools) · tools.py (logic, no SDK dep)
  corpus.py       deposit/search/corroborate/lookup/recalls — the shared core
  embeddings.py · telemetry.py · config.py · schemas.py · api.py · factory.py
eval/             dataset.py (30 paraphrase + 10 scope) · run_eval.py (the 3 numbers)
scripts/demo.py   the 3 worked examples + savings report
tests/            unit suites per module + test_end_to_end.py (Phase 0 acceptance)
                  + test_phase1_exit.py (Phase 1 acceptance: auto-correction,
                  budget steering, negation safety)
```

See [DECISIONS.md](DECISIONS.md). Out of scope (later phases): Ominis
attestation / depositor weighting, multi-org network + auth, web UI,
distributed/queue infra.
