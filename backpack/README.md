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

### Write-back: `remember()`

When an agent learns something durable mid-task, it saves it back so the next
task inherits it. Plain capture only — **no extraction, no inference** (garbage-in
risk stays near zero); the result is an ordinary library file the same engine
packs, lints, and evals. Identical findings are deduped, not duplicated.

```bash
node cli.js remember "Inbound webhooks must verify the X-Sig-V2 header" \
  --project Bouncr --title "Webhook v2 signature" --tags webhook,security --importance 4
```

## Use it from your agent (MCP)

RRSRCH is an **MCP server** — the product is something another agent calls
mid-task, not an app a human babysits. Point it at *your* repo's library with
`RRSRCH_LIBRARY`; set a default project with `RRSRCH_PROJECT`.

```bash
# add it to Claude Code (stdio)
claude mcp add rrsrch \
  --env RRSRCH_LIBRARY=/path/to/your/library \
  --env RRSRCH_PROJECT=Bouncr \
  -- node /absolute/path/to/RRSRCH/backpack/mcp/server.js
```

Or run it directly: `npm run mcp` (uses the bundled demo library unless
`RRSRCH_LIBRARY` is set). The server exposes five tools:

| Tool       | What the agent does                                             |
|------------|----------------------------------------------------------------|
| `pack`     | get the minimum useful context for a task, under a token budget |
| `expand`   | pull more items on a topic (progressive disclosure)             |
| `sources`  | get the source-backed items behind a topic                     |
| `related`  | get the neighborhood around a topic                            |
| `remember` | save a durable finding back into the library                    |

## Empty → useful in minutes (ingestion)

The adoption tax is hand-writing a library. So point rrsrch at a repo and it
**extracts a starter library for you** — deterministically, no LLM, no key:
markdown docs and ADRs become `decision`/`reference` items; `TODO`/`FIXME`/
`WARNING`/`NOTE`/`@deprecated` comments become `question`/`warning` items tagged
with their file.

Extraction is **never auto-trusted.** Every candidate is `provenance: extracted`,
low `confidence`, importance capped (never `always`, never high), and lands in a
**review queue** — `review/<project>/`, *not* `library/` — so the pack engine
literally cannot serve it until you accept it.

```bash
node cli.js extract /path/to/your/repo --project Acme   # scan → review queue (dedups)
node cli.js review  --project Acme                       # see what was found
node cli.js accept  "<id>" --project Acme                # promote into the library
node cli.js reject  "<id>" --project Acme                # discard
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

## The kill-switch experiment (Phase 1, gate)

The seed Bouncr library is too small to test the core thesis — at that size the
`pack` arm equals the `dump` arm, so "less is more" can't even be measured. The
**Helios** project is a deliberately bloated, adversarial fixture (~40 items: real
project conventions as load-bearing facts, lexically-similar distractors, stale +
cross-project decoys) where the budget genuinely bites.

```bash
npm run eval          # deterministic: already shows pack ≠ dump on Helios cases
ANTHROPIC_API_KEY=... npm run experiment   # the judged verdict (task-success)
```

`npm run experiment` runs each Helios task through all three arms, hands each
pack to a solver agent, and has an LLM judge (Sonnet 4.6, `temperature: 0`,
structured output) score the result against a fixed rubric — blind to which arm
produced it. The two numbers that decide Phase 1:

- **pack > naive on task-success** → the moat is *structure*, not truncation.
- **pack ≥ dump at far fewer tokens** → "less is more" is a *quality* wedge, not a discount.

If `pack` does not beat `naive`, the thesis fails and the MCP rewrite waits. This
is a genuine kill-switch, not a formality. (Needs an Anthropic API key; the rest
of the backpack runs with zero network and zero keys.)

## Status

**Phase 0 complete** — frozen schema, always-cap linter, deterministic eval +
baseline. **Phase 1 MVP shipped** — the **MCP server**
(`pack`/`expand`/`sources`/`related`) and **`remember()` write-back** are live and
covered by an end-to-end client→server test suite (`npm run test:unit`). The
deterministic eval gates every change on the two safety guarantees
(mandatory-coverage, no must-not leakage).

**Phase 2 in progress — retrieval quality (deterministic slice shipped).** The
engine now does **supersession-aware packing** (a replaced item is Archive-only),
a **graph-relatedness boost** (an item `related` to a strong match is lifted, so a
lexically-weak but load-bearing fact still earns a place), and **budget-aware
compression** via a two-pass packer (fill in the smallest faithful form to
maximize coverage, then upgrade to full text with leftover budget). On the new
budget-that-bites case, pack matches the full dump's recall at **~1/10 the tokens**
and beats naive truncation on every metric — *and* keeps the do-not-break
guarantee naive drops (see [`eval/phase2.txt`](./eval/phase2.txt); the original 10
cases stay byte-identical to [`eval/baseline.txt`](./eval/baseline.txt), so there's
no regression). Each mechanism has an isolated unit test.

It also ships an **opt-in, keyless semantic layer** (`lib/embed.js`): a
deterministic char-n-gram **vector recall-expansion** that recovers must-haves
exact-token matching misses (morphological variants like "webhook" ↔ "webhooks",
shared subwords) — *without* re-ranking the proven lexical+structural+graph
winners, so it's a pure recall gain with no regression (`test/embed.test.mjs`).
Enable it with `RRSRCH_EMBED=1`. It's off by default to keep packs deterministic;
on this well-tagged library the deterministic path already captures recall, so
embeddings are insurance for paraphrase-heavy / sparsely-tagged content. The
provider interface leaves clean seams for a local neural model (Transformers.js
MiniLM) and `sqlite-vec` as the vector store at scale.

**Phase 3 in progress — ingestion (deterministic slice shipped).** `extract` scans
a repo (markdown/ADRs + code-comment markers) into a quarantined **review queue**;
`review`/`accept`/`reject` curate it into the library. Extracted items are
`provenance: extracted`, low-confidence, importance-capped, and invisible to packs
until accepted — so garbage-in can't reach a pack (`test/ingest.test.mjs`). **Still
ahead:** transcript extraction + LLM enrichment of candidates, and the LLM-judged
kill-switch verdict on task-success (both await an API-key run).

The selection engine (`lib/engine.js`) is deliberately deterministic and
inspectable — you can see *why* each item made the pack. Everything else
(embeddings, rerank, scale, MCP so Claude Code / Cursor / Codex call `pack`
directly) is downstream of getting that index right, measured against the eval.

## License

[Apache-2.0](./LICENSE) — open-core. The engine, MCP server, and eval harness
are permissively licensed; hosted/team features come later and stay separable.
