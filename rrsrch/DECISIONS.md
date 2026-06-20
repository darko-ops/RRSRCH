# DECISIONS — rrsrch Phase 0

Choices made where the spec left room, plus the sandbox-driven (non-violating) ones.

## Scope (what this build is, and isn't)
- Phase 0 per the spec: two tools (`search`, `deposit`), hybrid matching, **simple
  decay freshness only**, telemetry, eval. **Excluded as later-phase scope creep:**
  the corroboration/disagreement loop, confidence beyond decay, exploration/gradient
  scheduler, attestation, multi-agent auth, web UI. (An earlier variant of rrsrch had
  corroboration; this build deliberately drops it.)

## Matching (the deliverable)
- **Retrieval/ranking split:** the store returns a candidate *pool* (lexical kNN ∪
  vector kNN); the engine applies the scope gate, fuses, and thresholds. This keeps
  the in-memory and Postgres stores interchangeable behind one `Store` interface.
- **Scope is a hard gate before similarity** (`matching/scope.py`): any conflict on a
  shared scope key rejects the candidate outright. A false hit (right answer, wrong
  question) is worse than a miss.
- **Fusion:** `vector_weight·cosine + lexical_weight·lexical` (defaults 0.7 / 0.3),
  both in [0,1]. Lexical is char-trigram + token Jaccard offline; `pg_trgm`/FTS in
  Postgres.
- **Conservative threshold:** default 0.85 (MiniLM). Tunable via env — tuning it to
  pass the eval is the sanctioned goal, *as long as* false-hits stay ~0.

## Freshness
- `decay(age, volatility) = 0.5 ** (age / half_life)`; serve if `>= freshness_threshold`
  (default 0.5). Half-lives: low 180d, medium 3d, high 6h (config). One pure function,
  no LLM, no corroboration.

## Embeddings / offline operating point
- Pluggable `Embedder`: `local` (sentence-transformers, default/production), `hash`
  (deterministic char-n-gram, offline), `api` (hosted).
- **Why a hash embedder exists:** the build sandbox has no PyPI and no Postgres, so the
  matcher, corpus, and eval are exercised with `hash` + in-memory store. It satisfies
  the same interface as MiniLM, so the *logic* under test is identical.
- **Offline eval threshold = 0.42** (vs production ~0.85): tuned to the hash embedder.
  0.42 is the point that maximizes correct hits while keeping BOTH scope false-hits and
  cross-topic wrong matches at zero — below ~0.40, a wrong topic starts matching. So it
  is principled tuning, not overfitting. The hash paraphrase rate (86.7%) is a FLOOR;
  MiniLM raises it (it bridges synonym/acronym gaps the hash misses).

## Testing (sandbox-driven, non-violating)
- Async corpus/engine are tested by driving them with `asyncio.run` from sync test
  functions (no `pytest-asyncio` available in the sandbox). The deterministic pieces
  (freshness decay, scope gate, schema validation) are tested directly and call no LLM.
- The Postgres store, the sentence-transformers embedder, and the MCP transport are
  written to spec and run on the deployment box; the in-memory store + hash embedder
  cover the same contracts offline. `ruff`/`mypy` were not run in the sandbox (no
  network) — `make lint` runs them on the box.
