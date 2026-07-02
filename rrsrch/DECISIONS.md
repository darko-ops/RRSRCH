# DECISIONS — rrsrch Phases 0+1

Choices made where the spec left room. Phase 1 additions at the bottom.

## Scope (what this build is, and isn't)
- Phase 0 per the spec: three tools (`search`, `deposit`, `corroborate`), hybrid
  matching, deterministic confidence (decay + corroboration re-earning), telemetry,
  eval, the three worked examples end-to-end. **Excluded as later-phase scope:**
  exploration/gradient scheduler, attestation, multi-agent auth, multi-tenancy, web UI.
- *(Reversed from an earlier draft of this file: corroboration was initially cut as
  "scope creep", but the spec's core thesis — confidence "re-earned by corroboration",
  worked example C — requires it. It is now in.)*

## Confidence (the trust engine)
- One pure module, `confidence.py` — no LLM, no store, no network (the INVIOLABLE
  RULE is commented at the top of it and of `corpus.py`).
- `confidence = 0.5 ** (age_since_anchor / half_life(volatility))` where
  `anchor = last_corroborated_at or created_at`. An agreeing corroboration moves the
  anchor to now → confidence re-earned to 1.0 and decaying afresh. A corroboration
  timestamp before `created_at` is ignored (never trust an impossible anchor).
- Serve iff `confidence >= confidence_threshold` (default **0.70**, per the spec's
  worked examples). Half-lives: low 180d, medium 3d, high 6h (all env-tunable).

## Corroboration
- **Deterministic agreement gate:** lexical similarity (trigram+token Jaccard) of the
  two claims vs `claim_agreement_threshold` (default 0.90). No LLM judges agreement.
- **Asymmetric risk drives the threshold:** a false "agreed" wrongly re-earns
  confidence for a possibly-wrong claim; a false "disagreed" merely replaces it with
  the fresh claim — recoverable. So the gate errs toward disagreement (0.90 is high:
  near-verbatim claims agree; "$0.023" vs "$0.021" disagree).
- **Disagreed → supersede, never edit:** old deposit gets `retired_at` +
  `superseded_by`; a new deposit is created (reusing the stored query embedding —
  same query text, re-encoding would be waste). Retired deposits are filtered out of
  the candidate pool at the store level, so the error cannot be served again. The
  full chain stays in the DB for audit.
- Agreed also merges the corroborator's sources into the deposit (more citations).

## Matching (the deliverable)
- **Retrieval/ranking split:** the store returns a candidate *pool* (lexical kNN ∪
  vector kNN over live deposits); the engine applies the scope gate, fuses, and
  thresholds. In-memory and Postgres stores stay interchangeable behind one `Store`.
- **Scope is a hard gate before similarity** (`matching/scope.py`): any conflict on a
  shared scope key rejects the candidate outright. A false hit (right answer, wrong
  question) is worse than a miss.
- **Fusion:** `vector_weight·cosine + lexical_weight·lexical` (defaults 0.7 / 0.3).
- **Conservative threshold:** default 0.85 (MiniLM); 0.42 for the hash embedder
  (offline eval), 0.55 in tests — each tuned so false-hits stay at zero.

## Performance decisions
- **Embedding off the event loop:** `encode()` (model inference) runs via
  `asyncio.to_thread` so one search doesn't stall every other in-flight request.
- **Concurrent hybrid retrieval:** the Postgres vector kNN and trigram kNN queries
  are independent and run under `asyncio.gather` on separate pooled connections.
- **Metrics aggregate in SQL** (GROUP BY / SUM) — `/metrics` never pulls event rows
  into Python. The in-memory store mirrors the same `event_stats()` contract.
- **Top-k without full sorts:** the in-memory pool uses `heapq.nlargest` (O(n log k)).
- **Embedding reuse on supersede:** a disagreed corroboration keeps the old query's
  embedding for the replacement deposit (identical query text).
- **Partial index on live deposits** (`WHERE retired_at IS NULL`) since every
  retrieval filters on it.

## Telemetry semantics
- Outcomes: `hit` (served), `stale` (known question, decayed confidence — caller
  should corroborate), `miss` (unknown). Stale/miss are charged the cold-path
  estimate; hits are charged the served claim+sources size (tiktoken).
- Corroborations (`agreed`/`disagreed`) are logged but not counted as queries.

## Embeddings / offline operating point
- Pluggable `Embedder`: `local` (sentence-transformers, default/production), `hash`
  (deterministic char-n-gram, offline), `api` (hosted).
- **Why a hash embedder exists:** tests/eval run with no model download and no
  Postgres; it satisfies the same interface as MiniLM, so the logic under test is
  identical. Its 86.7% paraphrase rate is a FLOOR — MiniLM bridges the
  synonym/acronym gaps the hash misses.

## Testing
- `pytest-asyncio` in auto mode; every store/corpus test is a native `async def`.
- Controllable clock (`now` injected into `Corpus`) simulates age — worked example C
  deposits a claim "60 days old" without waiting.
- `tests/test_end_to_end.py` is the acceptance suite: the spec's three worked
  examples (cold miss / warm hit / stale correction) run against the full stack.
- `ruff check` + `mypy src` are clean (`make lint`).

---

# Phase 1 — Proof-of-Search

## Topics (deterministic clustering)
- **Leader clustering, frozen centroids:** exact normalized-scope partition first,
  then cosine ≥ `topic_similarity_threshold` against existing centroids; the first
  deposit that opens a topic donates its embedding as the centroid *permanently*.
  No random init, no drift; ties break on topic_id (total order). Topic ids are
  content-derived (sha256 of scope_key + leader embedding), so re-running the same
  deposits in the same order reproduces the same topics exactly.
- Offline threshold is 0.50 (hash embedder) vs 0.80 production (MiniLM) — same
  rationale as the search similarity threshold.
- Pre-Phase-1 deposits have `topic_id = NULL` and simply don't participate in the
  bandit (they still serve). New deposits are assigned on write. No backfill job in
  Phase 1; re-depositing (or a later maintenance script) adopts them.

## Bandit (exploration.py — pure, bounded)
- Rates: seed from the volatility hint (low 0.02 / medium 0.08 / high 0.25),
  bounded [0.01, 0.50]. Agreement ×0.85 toward the floor; disagreement ×1.6 toward
  the ceiling. Multiplicative because the response should be proportional to how
  settled the topic already looked.
- The topic also carries a `half_life_factor` ∈ [0.25, 4.0]: ×1.15 per agreement
  (settled knowledge decays slower), ×0.5 per disagreement (proven-flaky decays
  faster). Applied inside `confidence()` as a multiplier on the half-life.
- **Immediate re-verification** after a disagreement is implemented by resetting
  `last_verified_at = NULL`, which maxes the verification priority — no side
  channel, no queue, fully deterministic.
- The ONLY randomness in the system is the explore coin flip; its RNG is injected
  (`Random(seed)` in tests, real entropy in prod).

## Observed volatility
- After ≥ `observed_volatility_min_obs` (5) corroborations, the topic's
  disagreement rate classifies it: ≥30% → high, ≥10% → medium, else low — and that
  overrides the depositor's hint in the confidence computation. Below 5
  observations the hint stands (a prior needs evidence to be overturned).

## Self-verification (verification.py)
- `priority = age_since_last_verified × exploration_rate`; `verify_once()` takes
  the top `verify_batch_size` topics, re-derives via the injected `SearchProvider`,
  and feeds `corroborate()`. Single-process async loop; deliberately no
  Celery/Redis (out of scope).
- After a verify pass the topic is stamped `last_verified_at = now` even on
  disagreement — the replacement deposit was just verified by construction; the
  NEXT disagreement will reset the stamp again.
- `rrsrch-verify` (entry point) intentionally exits with instructions until a real
  SearchProvider is wired in the factory: shipping a stub that silently no-ops
  would fake the guarantee.

## Agreement gate v2 (agreement.py)
- Extraction (numbers/entities/polarity) is behind an `Extractor` protocol: regex
  by default, an LLM may implement it later — the LLM *proposes*, code *decides*.
  Rule order is safety-first: polarity mismatch → disagree; numeric mismatch
  (beyond 1% relative tolerance) → disagree; numeric match → agree; entity overlap
  (+ moderate lexical) → agree; else the Phase 0 lexical gate (0.90) as fallback.
- Numbers use subset matching (the shorter list must be covered) so an added
  context number ("… January 2026") doesn't fake a disagreement, while a changed
  price does. Known limitation, documented: antonyms without negation markers
  ("fastest" vs "slowest") still fall through to the lexical fallback.
- Every verdict logs both sides' extracted fields + the rule that fired into
  `query_events.detail` (JSONB) — auditable after the fact.

## Telemetry
- Exploration spend is logged as `explore` events and **counts against**
  `tokens_with_rrsrch` — the savings claim stays honest about what verification
  costs. Per-topic budget flow comes from GROUP BY topic_id in SQL.
- `time_to_correction` is computed deterministically at retirement time
  (now − the moment confidence crossed the serve threshold, from the closed-form
  decay inverse) and logged in the disagreed event's detail; /metrics averages it.

---

# Real-stack validation (2026-07-02)

## Divergences the in-memory store was hiding (all fixed, none skipped)
1. **`db.py` engine singleton** ignored every `Settings` after the first call —
   now cached per database URL. (Also: the test fixture injects a NullPool
   sessionmaker per test so asyncpg connections never cross pytest event loops.)
2. **`PostgresStore.log_event` dropped `event["ts"]`** — the server clock silently
   overrode the injected/simulated clock the in-memory store honored.
3. **Nondeterministic ordering on `created_at` ties** in `latest_live_deposit` and
   `recalls` — simulated clocks produce exact ties; both stores now tie-break on
   uuid identically (Python `UUID.int` order == Postgres bytewise uuid order).

## MiniLM operating point (measured, reports/real-stack.md)
- The old 0.85 default was wrong for the FUSED score (3.3% hits!) — the fusion is
  0.7·cosine + 0.3·lexical and paraphrases score low on the lexical half. Sweep
  knee = **0.525** (96.7% hits, plateau 0.40–0.53, false-hits 0 everywhere).
- MiniLM beats the hash floor 96.7% vs 86.7%; the one residual miss is acronym
  expansion ("GIL" ↔ "global interpreter lock") — model limitation, not gate bug.
- Scope hard-gate held at EVERY threshold on MiniLM (us-east-1/eu-west-1 pinned
  by an explicit integration test) — serving safety never depends on the embedder.

## Live provider
- `WebSearchProvider` = Claude Code CLI headless (`claude -p`, WebSearch/WebFetch
  allowed): search + fetch + distill with the machine's existing CLI auth, no
  separate API key. Env-gated (`RRSRCH_PROVIDER=claude-cli`); construction fails
  loudly when unconfigured — a silently no-op'ing verifier would fake the
  guarantee. Tests always use the fake provider; live runs only via
  `make verify-live` / `rrsrch-verify`.
- `tokens_spent` = the CLI's reported input+output usage — real spend, logged
  against the savings claim.

## Serve-path intent guard (false-hit hardening, 2026-07-02)
- **The hole:** polarity/predicate intelligence lived only in the corroboration
  gate; the SERVE path trusted similarity + scope. Same-scope intent flips
  ("require MFA?" vs "NOT require MFA?") measure 0.95+ on MiniLM — served wrong.
- **One extractor, two consumers:** `ClaimFields` gained `predicates`
  (antonym axis → ±1: obligation, activation, installation, direction,
  permission, inclusion, order); `RegexExtractor` populates it; the corroboration
  `verdict()` ignores it (behavior unchanged — verified by the untouched suite).
  `intent_verdict()` is the new pure function; `corpus.search` walks ranked
  candidates and serves the first that passes — a rejection is not a dead end
  (if both directions are deposited, the right one serves).
- **Asymmetry:** any flip rejects even at similarity 0.97 (false hit = wrong
  answer; false miss = one fresh search). Ambiguity never rejects: no shared
  signal → similarity decides (mirrors the corroboration lexical fallback), and
  a text containing BOTH poles of an axis drops that axis as ambiguous.
- **Suffix stripping is candidate generation, not stemming:** 'requirements'
  deliberately maps to nothing (no signal ≠ wrong signal), which is exactly why
  "what does X require?" vs "what are X's requirements?" still hits.
- **Measured** (eval, isolated corpora so intent deposits can't perturb the
  original sets): intent-false-hits 0/16 with the guard catching 16/16 on both
  hash and MiniLM; 8/8 intent-preserving paraphrases hit, 0 wrongly blocked;
  paraphrase rate unchanged (96.7% MiniLM), scope false-hits still 0.
- Known limitation (documented, accepted): antonym pairs without a lexicon entry
  or negation marker ("fastest" vs "slowest") pass through to similarity — the
  lexicon is deliberately tight because every entry can reject a serve.

## Considered, deferred
- **`never_serve` volatility tier** (always-fresh facts like FX rates, instead of
  paying ceiling-rate exploration forever): legitimate, but it's new product
  surface — out of scope for a validation task. Revisit with Phase 3.
- The bandit round trip (ceiling → floor on re-stabilization) IS tested
  (`test_bandit_round_trip_rate_recovers_when_topic_restabilizes`).

## Phase 1 exit criteria (tests/test_phase1_exit.py)
1. automatic correction: verifier + FakeSearchProvider catches a 60-day-old
   high-volatility claim, retires it, /recalls and lookup() expose the change.
2. budget steering: 60 simulated days, 1 verification/day — settled topic reaches
   the floor, volatile reaches the ceiling (19× spend concentration; curves
   printed; `make steering`). The volatile topic was hinted "low" and its observed
   volatility ends "high" — the override proven in the same run.
3. negation safety: "is compliant" vs "is not compliant" → disagreed
   (polarity_mismatch) despite lexical ≈ 0.8; numeric paraphrase → agreed
   (numeric_match) despite lexical < 0.9.
4. no regression: the Phase 0 suites run unmodified (except the corroborate tests
   whose claims now agree via numeric_match instead of lexical_match — same
   outcomes).
