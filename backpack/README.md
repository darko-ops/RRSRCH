# RRSRCH — the backpack for agents

Token-efficient memory for AI agents. RRSRCH stores the big library but hands an
agent only a **context pack**: the minimum useful bundle of memory, sources, and
decisions for the task ahead — plus a map to get more when it needs it.

> Agents fail two ways: too little context (dumb assumptions) or too much
> (drown, waste tokens, miss what matters). RRSRCH gives the right amount.

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

## Status

v0 prototype. The selection engine (`lib/engine.js`) is deliberately
deterministic and inspectable — you can see *why* each item made the pack. The
retrieval quality of that index is the moat; everything else (embeddings, scale,
an MCP server so Claude Code / Cursor / Codex can call `pack` directly) is
downstream of getting it right.
