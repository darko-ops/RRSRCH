# RRSRCH

**Trust what your agents know.**

This is the monorepo behind [rrsrch.com](https://rrsrch.com) — two products that
attack the same problem from opposite ends: agents act on things they cannot
verify. **Backpack** verifies what they *know*; **Atlas** verifies what they
*run on*.

| | | |
|---|---|---|
| **Backpack** | Shared, verified memory for your agents | Self-host today |
| **Atlas** | A verified map of your system, with evidence | Pilot |

---

## Backpack — shared, verified memory

*Directory: [`rrsrch/`](rrsrch/) · Python · MCP + HTTP*

Agents burn enormous token budgets re-deriving knowledge other agents already
established. Backpack (the `rrsrch` engine) stores *distilled* results — a
compact claim plus its sources — and serves them when a similar question comes
back, **only while the answer is still trustworthy**.

**The inviolable rule:** confidence, the serve-vs-research decision, the
explore-vs-exploit decision, and the corroboration verdict are all
**deterministic, auditable code**. An LLM may distill sources, judge query
similarity, and extract structured fields from a claim — it never computes a
score, never renders a verdict, never decides what to trust.

What that buys you:

- **A hard scope gate before similarity.** S3 pricing in `us-east-1` never
  serves the answer for `eu-west-1`; API `v3` never serves `v4`. Implicit scope
  in the query prose (the tech/language/platform it's *about*) gates the same
  way — "in Rust" never serves the CSS answer.
- **An intent guard as the last check.** "Does X require Y?" and "does X *not*
  require Y?" embed near-identically; the guard compares polarity and predicate
  direction and rejects on any flip, even at similarity 0.97.
- **Confidence that decays.** `0.5 ** (age / half_life)`, anchored at the last
  corroboration. Agreement re-earns confidence to 1.0; disagreement retires the
  claim and points at its replacement.
- **Proof-of-Search.** A per-topic exploration bandit steers a verification
  budget toward uncertainty. A self-verification loop catches stale answers with
  no agent and no human in the loop, and a `recalls` feed publishes every
  retirement so downstream caches can correct themselves.
- **Multi-depositor trust.** Per-depositor trust is a pure Beta-ratio of
  independently-recorded corroboration outcomes, with Sybil, grief, and
  claim-age guards. Measured: 0/19 poison deposits served under 40% hostile
  traffic.

**Measured, not simulated** (Postgres + MiniLM — see
[`rrsrch/reports/`](rrsrch/reports/)): 96.7% paraphrase hit rate at the tuned
fused threshold, 0 scope false-hits at every threshold in the sweep, and one
live proof-of-search cycle that caught an outdated claim and superseded it with
cited fresh research in 34 seconds.

```bash
cd rrsrch
make up      # Postgres+pgvector + app (migrates on boot); /metrics on :8000
make test    # the unit suite — offline, no Postgres needed
make eval    # the matching eval: prints the three exit numbers
make demo    # 3 worked examples + the savings report
```

Point an agent at it over MCP — three tools, `search` / `deposit` /
`corroborate`:

```bash
claude mcp add rrsrch -- rrsrch-mcp
```

Full documentation, the confidence math, the matcher internals, and the eval
numbers: **[`rrsrch/README.md`](rrsrch/README.md)**. Design rationale:
[`rrsrch/DECISIONS.md`](rrsrch/DECISIONS.md).

---

## Atlas — a verified map of your system

*Directory: [`atlas-probe/`](atlas-probe/) · Python · MCP + CLI*

Architecture diagrams describe what someone *believed* was true. Atlas builds a
system graph from independent evidence classes — declared (config, IaC,
manifests) and observed (live, read-only shell evidence) — and reconciles them
deterministically. Every edge lands in one of four states:

| State | Meaning |
|---|---|
| `confirmed` | declared **and** independently observed |
| `phantom` | declared, an observer looked, and it is **not** there |
| `shadow` | observed running, never declared |
| `undecidable` | declared, but no connected source *can* observe it — an evidence gap, stated honestly |

Phantom and shadow edges are the findings an audit cares about: documented but
absent, or running in production and documented nowhere. `undecidable` is the
discipline that keeps the rest credible — Atlas never guesses to fill a gap.

Nothing is hardcoded. The probe discovers your stack at runtime from the repo's
own files (`package.json`, `pyproject`/`requirements`, `docker-compose`, the
Vercel link, env variable *names*) and from live read-only evidence (`docker
ps`, port checks, a curl against the production domain, the Vercel CLI). Env
**values** are never read except to extract a host from `*_URL`-style names —
credentials are stripped, secrets are never touched.

```bash
pip install ./atlas-probe
cd ~/code/your-project && atlas-probe    # → ~/.atlas/targets/<name>/atlas_graph.json
```

Then give an agent read-only access to the attestation:

```bash
claude mcp add atlas --scope user \
    --env ATLAS_GRAPH=/path/to/atlas_graph.json \
    -- atlas-mcp
```

The MCP server is thin and read-only — every tool answers from the exported
graph. No probing, no LLM, no writes. Publish an attestation to your rrsrch.com
account and the Atlas tab renders it.

---

## The site

`rrsrch.com` — a React SPA plus an Express API, deployed on Vercel.

```
rrsrch-react/     the SPA: product pages, the account dashboard, the Atlas
                  attestation viewer (src/AtlasView.js)
server.js         the Express app: accounts, projects, Google OAuth, device
                  pairing for CLI clients, Atlas publish/read/delete
api/index.js      the Vercel serverless entry point — re-exports server.js
vercel.json       build config: SPA build + /api/* → the Express app
```

Local development:

```bash
npm install && npm run dev                     # API on :3001
cd rrsrch-react && npm install && npm start    # SPA on :3000
```

Deploys are handled by Vercel on push. Environment variables (Twitter API,
Google OAuth, session secret, blob storage) are configured in the Vercel
project — `.env` is never committed.

---

## Repository layout

```
rrsrch/           the Backpack engine (Python) — corpus, matcher, confidence,
                  bandit, MCP server, eval harness, measurement reports
atlas-probe/      the Atlas probe + read-only MCP server (pip-installable)
rrsrch-react/     the rrsrch.com SPA
server.js         the rrsrch.com API (Express)
api/              Vercel serverless entry point
.github/          CI — gates the Backpack engine on its unit suite and eval
```

## CI

[`.github/workflows/rrsrch-ci.yml`](.github/workflows/rrsrch-ci.yml) runs on any
push touching `rrsrch/`: the unit suite and the matching eval, both fully
offline (in-memory store, deterministic hash embedder). `make eval` exits
non-zero on a regression, so a drop in paraphrase hit rate or a scope false-hit
fails the build. The Postgres and MiniLM variants (`make test-pg`,
`make flywheel`, `make multiagent`) run on the deployment box, not in CI.

## Links

- Website — [rrsrch.com](https://rrsrch.com)
- Backpack docs — [`rrsrch/README.md`](rrsrch/README.md)
- Measurement reports — [`rrsrch/reports/`](rrsrch/reports/)
