# DECISIONS — rrsrch Phase 0

Ambiguities resolved while building, per the spec's "pick the simplest thing that
satisfies the INVIOLABLE RULE and the three worked examples, note it, keep moving."

## Architecture

- **Interfaces over hard-wiring (so the trust core is testable offline).** The MUST
  stack — Postgres+pgvector via SQLAlchemy, local sentence-transformers embeddings,
  the `mcp` SDK — is implemented. But the corpus logic depends on two *interfaces*,
  `Embedder` and `CorpusStore`, each with two implementations:
  - real: `LocalSentenceTransformerEmbedder`, `PostgresCorpusStore` (the deployable path);
  - offline: `HashEmbedder` (deterministic, numpy), `InMemoryCorpusStore` (numpy cosine).
  The offline pair lets `confidence`, `matching`, `corpus`, `telemetry`, and the three
  worked examples be unit-tested with **zero external services** — which is also how
  they were verified in the build sandbox (no PyPI/Postgres there). Production uses the
  real pair via config; tests use the offline pair. The logic under test is identical.

- **The confidence engine is a pure module** (`confidence.py`): no IO, no LLM, no ORM.
  It operates on a small frozen `DepositState` value object, not on the SQLAlchemy row,
  so the trust boundary can never accidentally acquire a DB or model dependency. The ORM
  model produces a `DepositState`; the engine scores it.

## Confidence

- `base()` returns a fixed `0.80` in Phase 0 (no Ominis). Signature carries an optional
  `attestation` arg, unused now, for the Phase 3 handshake.
- Decay anchor: `last_corroborated_at` when `corroboration_count > 0`, else `created_at`
  — so corroboration both boosts (multiplier) *and* slows decay (resets the age clock).
- `corroboration_boost = min(1 + 0.15·ln(1+count), 1.6)`; `disagreement_penalty = 0.5**count`.
- Half-lives (config): low 180d, medium 14d, high 1d. Serve threshold 0.70; retire floor 0.15.

## Volatility

- Trust a valid `volatility_hint`, but apply a keyword sanity-check: if the hint is `low`
  yet the query contains strong freshness words (`current/price/today/latest/now/live/…`),
  nudge to `medium` (never silently trust "low" for an obviously live topic). No hint →
  keyword guess, default `medium`. Deterministic; no LLM.

## Matching

- Query equivalence is vector cosine (deterministic given the model) + a **scope gate**:
  any shared scope key with conflicting values (region, version, as_of_date) rejects the
  candidate regardless of similarity. Similarity floor default 0.82. LLM re-ranker hook is
  documented but off (not built) in Phase 0.
- Corroboration agreement is decided by **claim-embedding cosine ≥ 0.90**, not an LLM verdict.

## Testing deviations (sandbox-driven, not spec-violating)

- `hypothesis` and `pytest-asyncio` aren't available in the build sandbox, so tests use
  plain `pytest` with explicit boundary/monotonicity cases (property-style by hand) and the
  async surfaces are tested through synchronous core functions where possible. The real
  Postgres/sentence-transformers/MCP layers are written to spec but executed on the target
  box (DGX Spark), not in the build sandbox.
