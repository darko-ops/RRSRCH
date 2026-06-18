# RRSRCH — the backpack for agents

Token-efficient memory for AI agents. RRSRCH stores the big library but hands an
agent only a **context pack**: the minimum useful bundle of memory, sources, and
decisions for the task ahead — plus a map to get more when it needs it.

> Agents fail two ways: too little context (dumb assumptions) or too much
> (drown, waste tokens, miss what matters). RRSRCH gives the right amount.

## Try it in 60 seconds

Zero dependencies — just Node ≥18.

```bash
git clone https://github.com/darko-ops/RRSRCH.git
cd RRSRCH/backpack

# build a context pack for a real task, under a token budget
node cli.js pack "Implement merchant Stripe Connect onboarding" --project Bouncr --budget 2500

# check the library is healthy, then run the eval harness against the v0 engine
npm run lint:lib
npm run eval
```

`npm run eval` prints per-case / per-arm metrics and exits non-zero if the
engine ever drops a do-not-break item or leaks a forbidden one.

## Why a backpack, not a brain dump

Most "agent memory" products throw the whole library into vector search and
flood the prompt. That makes agents slower, costlier, and more confused. A
backpack is the opposite philosophy: **carry only what the mission needs, but
know where to get more.**

## The five layers

| Layer    | Size (approx) | When it travels                         |
|----------|---------------|-----------------------------------------|
| Brief    | 300–500 tok   | smallest useful version                  |
| Pack     | 1.5k–3k tok   | the working bundle (default)             |
| Dossier  | 5k–10k tok    | full background, on request              |
| Sources  | as needed     | raw source-backed material               |
| Archive  | never auto    | stale / everything else — `expand` only  |

Stale items live in the Archive and are **never** auto-packed — only reachable
via `expand()`. "Do-not-break" warnings are flagged `always: true` and survive
budget compression so the agent never loses the rules that matter.

## The killer function

```
rrsrch.pack(task, project, token_budget)
```

```bash
node cli.js pack "Implement merchant Stripe Connect onboarding" \
  --project Bouncr --budget 2500
```

### Progressive disclosure

The agent starts small and pulls more only if needed:

```bash
node cli.js expand  "stripe webhook details"        --project Bouncr
node cli.js sources "why did we choose Connect Standard?" --project Bouncr
node cli.js related "merchant onboarding risks"     --project Bouncr
```

## The library

Knowledge lives as markdown files under `library/<project>/`, each with
frontmatter the **index** reasons over — not just text similarity:

```yaml
---
project: Bouncr
type: decision        # decision|constraint|warning|source|reference|file|question
importance: 5         # 1..5
stale: false          # true → Archive only
always: false         # true → always carried (do-not-break)
files: [/lib/stripe.ts]
---
```

## Eval & schema (the discipline)

Retrieval quality is the moat, so it's measured — no retrieval change ships
without moving a metric on the golden set.

```bash
npm run lint:lib        # validate the library against schema/item.schema.json
npm run test:always-cap # prove the always-cap lint rejects over-flagging
npm run eval            # golden-set metrics vs the v0 engine (the baseline to beat)
npm test                # all of the above; CI gate
```

- **`schema/item.schema.json`** is the frozen contract (ROADMAP §4); the
  validator derives required fields, enums, and bounds from it, then enforces
  structural rules: ids unique per project, `supersedes`/`related` edges resolve,
  and the **always-cap** — the summed tokens of `always` (do-not-break) items per
  project may not exceed the Brief-tier ceiling. Over-flagging is a *build
  failure*, not a silent overflow, so the safety guarantee can't quietly become
  the flood it exists to prevent.
- **`eval/`** holds the golden cases and a three-arm **Experiment #1**
  (`dump` vs similarity-only `naive` vs structured `pack`). Only the `pack` arm
  is gated, on the two guarantees — mandatory-coverage and no must-not leakage.
  `recall@budget`, `noise`, and `token-efficiency` are reported baseline numbers
  to beat in Phase 2; `task-success` + `expand-precision` arrive with the Phase 1
  agent loop.

See [`ROADMAP.md`](./ROADMAP.md) and [`PHASE0.md`](./PHASE0.md).

## Status

**Phase 0 complete** — data model frozen as a JSON contract, library linter with
the always-cap, and an eval harness that runs against the v0 engine with recorded
baseline numbers (`eval/baseline.txt`). Next: Phase 1 — TypeScript engine, MCP
server (`pack`/`expand`/`sources`/`related`), and `remember()` write-back.

The selection engine (`lib/engine.js`) is deliberately deterministic and
inspectable — you can see *why* each item made the pack. Everything else
(embeddings, rerank, scale, MCP so Claude Code / Cursor / Codex call `pack`
directly) is downstream of getting that index right, measured against the eval.

## License

[Apache-2.0](./LICENSE) — open-core. The engine, MCP server, and eval harness
are permissively licensed; hosted/team features come later and stay separable.
