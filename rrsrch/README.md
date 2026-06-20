# rrsrch — Phase 0: single-player research memory

Agents waste enormous tokens re-deriving knowledge other agents already
established. **rrsrch** stores *distilled* results (a compact claim + sources) and
serves them when a similar question comes back — **only while the answer is still
fresh.** Phase 0 is single-player: one agent, no network, no attestation. Two
tools, a hybrid matcher, a simple freshness decay, and telemetry that proves the
savings.

## Core principle (not violated)
The serve-vs-re-search decision is **deterministic code**: matching similarity
(vectors + lexical, never an LLM) clears a threshold, then freshness decay clears a
threshold. An LLM may distill sources into a claim, but it never computes the
score or makes the serve decision. Trust stays auditable.

## Run it
```bash
make up            # Postgres+pgvector + app (migrates on boot); /metrics on :8000
make test          # unit tests (offline, no Postgres)
make eval          # the matching eval — prints the three exit numbers
```
Point an MCP client at the stdio command `rrsrch-mcp`. It exposes two tools:
- **`search(query, scope?)`** → best match with freshness `confidence`, `age_seconds`,
  `sources`, and a `serve` boolean — or a structured miss (never throws).
- **`deposit(query, claim, sources, volatility_hint, scope?)`** → stores a distilled,
  cited result, stamped with a timestamp.

## The matcher (where the value is)
Hit rate is the whole value prop, so matching quality is the deliverable.
- **Hybrid retrieval:** lexical (Postgres FTS / `pg_trgm`) ∪ vector (pgvector cosine)
  candidates, fused as `vector_weight·cosine + lexical_weight·lexical`, thresholded
  (conservative — a false hit is worse than a miss).
- **Scope is a hard gate, applied *before* similarity:** two near-identical queries
  with different scope (S3 price `us-east-1` vs `eu-west-1`, API `v3` vs `v4`) never
  match, no matter how similar.

## Freshness (Phase 0 = simple decay only)
`confidence = 0.5 ** (age / half_life(volatility))`; serve if `confidence >= threshold`.
Half-lives: low → months, medium → days, high → hours. **No** corroboration,
disagreement, or exploration loop — those are later phases (deliberately out of scope).

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

> These numbers are from the **offline** config (in-memory store + deterministic
> hash embedder) so the eval runs with no Postgres and no model download — that's
> how they were produced here. The hash embedder captures lexical/morphological
> similarity but not deep semantics, so **86.7% is a floor**: the four misses are
> synonym/acronym gaps (e.g. "GIL" ↔ "global interpreter lock") that the production
> sentence-transformers model bridges. Run the real config with
> `RRSRCH_EMBEDDER=local RRSRCH_SIMILARITY_THRESHOLD=0.85 make eval`. The scope
> false-hit rate (0%) and the cost ratio are embedder-independent.

## Layout
```
src/rrsrch/
  matching/   scope.py (hard gate) · lexical.py (trigram) · engine.py (hybrid fuse)
  freshness/  decay.py (deterministic serve gate)
  store/      base.py (interface) · memory.py · postgres.py (pgvector+pg_trgm) · models.py · db.py
  mcp/        server.py (thin, 2 tools) · tools.py (logic, no SDK dep)
  corpus.py   deposit() + search() — the shared core
  embeddings.py · telemetry.py · config.py · schemas.py · api.py · factory.py
eval/         dataset.py (30 paraphrase + 10 scope) · run_eval.py (the 3 numbers)
tests/        freshness / scope / schema / matching / corpus / mcp-tools (deterministic)
```

See [DECISIONS.md](DECISIONS.md). Out of scope for Phase 0 (do not add): confidence
model beyond decay, corroboration, disagreement handling, exploration scheduler,
attestation, multi-agent auth, web UI.
