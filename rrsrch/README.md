# rrsrch — a shared, agent-populated research corpus (Phase 0)

**Search once. Reuse forever. Trust what you reuse.**

Agents waste enormous tokens re-deriving knowledge other agents already established.
rrsrch stores **distilled results** (a compact claim + sources), not raw pages. When a
similar query arrives later it serves the stored answer cheaply — **only if that answer
is still trustworthy.** Trust is not binary: every deposit has a live **confidence
score** that decays at a rate set by topic volatility and is re-earned by corroboration.
Above threshold → serve (cheap). Below → tell the caller it's stale so they re-derive.

Phase 0 is the **single-player MVP**: one user's own agents deposit results once and
retrieve them instead of re-deriving. No multi-tenancy, no attestation, no network. The
goal is to *prove reuse works* and *measure the token savings*.

## The inviolable rule

> The confidence score and the serve-vs-miss decision are **deterministic code**. An
> LLM may help with fuzzy, recoverable work (judging if two questions are similar,
> distilling sources into a claim) but **never** computes confidence or decides
> trustworthiness. The trust boundary is code, always.

This is architectural: [`confidence.py`](src/rrsrch/confidence.py) is a pure module —
no IO, no LLM, no ORM, `now` passed in — and it's the most heavily tested file in the
repo. Corroboration agreement is decided by claim-embedding cosine, not an LLM verdict.

## Quickstart (deployed: Postgres + local embeddings)

```bash
# 1. start Postgres + pgvector
docker compose up -d

# 2. install + migrate
uv sync   # or: python -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"
cp .env.example .env
alembic upgrade head

# 3a. run the agent-facing MCP server (stdio)
rrsrch-mcp
# 3b. and/or the operator HTTP API (health + metrics)
rrsrch-api      # http://localhost:8000/health , /metrics
```

Point an MCP client (Claude Code / Cursor) at the stdio command `rrsrch-mcp`. It exposes
three tools — `rrsrch_search`, `rrsrch_deposit`, `rrsrch_corroborate` — whose docstrings
tell the agent what to do with each outcome (`hit` → use it, `stale`/`miss` → re-derive
then deposit).

## See it work in 5 seconds (offline, no Postgres, no model download)

```bash
PYTHONPATH=src python scripts/demo.py
```

Runs the three worked examples and prints the savings report:

- **A — cold miss:** first ask is a `miss`; the agent researches and deposits.
- **B — warm hit:** 3 days later a *paraphrase* is a `hit`, confidence still high (low
  volatility barely decays) — the served answer costs a fraction of the cold path.
- **C — stale correction:** a 60-day-old high-volatility price reads `stale`; a fresh
  corroboration that *disagrees* retires the old deposit and supersedes it, so the next
  asker gets the corrected answer. The error never propagates.

## How to read the savings (the headline number)

`/metrics` (and `corpus.savings_report()`) report: total queries, **hit rate**, total
**tokens saved**, avg tokens/query *with vs without* rrsrch, and a breakdown by
volatility. Hit rate — and therefore savings — rises as the corpus fills (the efficiency
flywheel). The cold-path cost is `RRSRCH_COLD_PATH_ESTIMATE_TOKENS` (default 90k).

## The knobs (all config, via `RRSRCH_*` env — see `.env.example`)

serve threshold (0.70) · retire floor (0.15) · base confidence (0.80) · half-lives
(low 180d / medium 14d / high 1d) · similarity floor (0.82 for MiniLM) · agreement
floor (0.90) · cold-path estimate.

## Layout

```
src/rrsrch/
  confidence.py   # DETERMINISTIC trust engine (pure; tested hardest)
  volatility.py   # volatility_hint + keyword sanity-check -> decay class
  embedder.py     # Embedder interface: sentence-transformers + hash fallback
  matching.py     # vector similarity + the SCOPE GATE (right answer, right question)
  corpus.py       # deposit() / search() / corroborate() — the heart
  telemetry.py    # token accounting + savings report
  store.py        # CorpusStore interface + in-memory impl
  store_pg.py     # Postgres + pgvector impl
  models.py db.py # SQLAlchemy ORM + async engine
  distiller.py    # optional LLM source->claim compressor (off by default)
  mcp_server.py   # thin MCP transport over tools.py
  tools.py        # agent-facing tool logic (no SDK dependency)
  api.py          # FastAPI: /health, /metrics, /debug
scripts/demo.py   # the three worked examples + savings report
tests/            # confidence + matching tested hardest; the 3 examples as e2e
```

## Testing

```bash
pytest                  # full suite
```

The corpus logic is tested against the **offline pair** (in-memory store + hash
embedder) with a controllable clock, so the trust engine, matching, corroboration, and
the three worked examples run with **zero external services**. The Postgres/pgvector
store, the sentence-transformers embedder, and the MCP transport are exercised on the
deployed box; the in-memory store and hash embedder satisfy the *same* interfaces, so
the logic under test is identical. See [`DECISIONS.md`](DECISIONS.md).
