# RRSRCH Roadmap — the backpack for agents

> **Product in one line:** Token-efficient memory for AI agents. Store the full
> library; hand each task the *minimum useful context pack* plus a map to get
> more on demand.

This document is the build plan. It is opinionated on sequencing because the
hard part of this product is **retrieval quality under a token budget**, and the
only way to get that right is to make it measurable before making it clever.

---

## 1. North star & positioning

**The problem.** Agents fail two ways: too little context (dumb assumptions) or
too much (drown, waste tokens, miss what matters). Existing "agent memory" =
dump everything into vector search and flood the prompt.

**Our wedge.** RRSRCH gives the *right amount*: a structured, token-budgeted
pack of decisions, constraints, warnings, files, and sources — with the
"do-not-break" rules guaranteed to survive compression, and everything else one
`expand()` away.

**Primary user (ICP) — pick one to win first:** individual coding-agent power
users (Claude Code / Cursor / Codex / MCP). They feel the pain daily, they
install tools themselves, and they're reachable. Teams/hosted come later.

**Distribution:** MCP server first. The product is something *another agent
calls mid-task*, not an app a human babysits.

**The wedge is quality, not cost.** With 200k windows + prompt caching, "fewer
tokens" is a *cost* argument, and cost-optimizers are commoditizable. Our actual
claim is stronger: **more context degrades the agent** (distraction,
lost-in-the-middle), so a 2.5k structured Pack *beats* an 8k dump on
**task-success** — not just on price. If that's true we have a quality product;
if it only wins on tokens we have a discount. Proving this is experiment #1 (§6).

**Why we can win:** the moat isn't storage (commodity) — it's the **index +
budget-aware packing + safety guarantees**, validated by an eval harness most
competitors don't have.

---

## 2. Principles (non-negotiable)

1. **Eval before cleverness.** No retrieval change ships without moving a metric
   on the golden set.
2. **Smallest useful pack.** Default to less context. Make the agent *ask* for
   more (progressive disclosure), don't pre-load it.
3. **Deterministic & explainable core.** Every pack can show *why* each item was
   included. Debuggability is a feature.
4. **Safety survives compression — but is capped.** `always`/do-not-break items
   and secret redaction are guarantees, not best-effort. *And* reserved items are
   bounded: they may not exceed a ceiling of the smallest (Brief) tier. Breaching
   the cap is an **error** and a library-health lint ("too many things marked
   do-not-break"), never a silent overflow — or the guarantee becomes the new
   flood with extra steps.
5. **Thin vertical slices.** Every phase is shippable and dogfooded on a real
   project before the next begins.
6. **Token honesty.** Always account for and report token cost. The number on
   every pack is the product promise.
7. **Versioned schema from day one.** Knowledge evolves (supersession,
   staleness); migrations exist from the start.

---

## 3. Architecture (target)

```
            ┌──────────────────────────────────────────────┐
 INGESTION  │  manual md · auto-extract (repo/docs/ADRs) ·  │
            │  agent write-back · dedup/conflict/staleness  │
            └───────────────────────┬──────────────────────┘
                                    ▼
 LIBRARY    ┌──────────────────────────────────────────────┐
 (warehouse)│  items (md+frontmatter) → SQLite → Postgres   │
            │  schema + embeddings + supersession links     │
            └───────────────────────┬──────────────────────┘
                                    ▼
 INDEX      ┌──────────────────────────────────────────────┐
 (the moat) │  candidate gen: BM25 ⊕ embeddings (RRF)       │
            │  rerank: cross-encoder / LLM                  │
            │  structural signals: type·importance·fresh·   │
            │  project scope · graph relatedness            │
            └───────────────────────┬──────────────────────┘
                                    ▼
 PACKER     ┌──────────────────────────────────────────────┐
            │  budget knapsack · reserve always-items ·     │
            │  layers (brief/pack/dossier) · compress to fit │
            │  · provenance trace                            │
            └───────────────────────┬──────────────────────┘
                                    ▼
 API        ┌──────────────────────────────────────────────┐
            │  MCP tools · SDK (TS/Py) · CLI · HTTP (hosted) │
            │  pack · expand · sources · related · remember  │
            └───────────────────────┬──────────────────────┘
                                    ▼
 EVAL + OBSERVABILITY (cross-cutting): golden set · recall@budget ·
 task-success · token efficiency · usage telemetry → index tuning
```

### Subsystems

- **Library (warehouse):** every note/decision/source. FS → SQLite → Postgres.
- **Index (moat):** candidate generation + rerank + structural scoring.
- **Packer:** budget-constrained assembly with safety reservations + compression.
- **API:** MCP / SDK / CLI / HTTP.
- **Ingestion:** how knowledge gets in (the adoption wedge).
- **Eval + Observability:** how we know it's good and keep it good.

---

## 4. Data model (lock this first)

```ts
type ItemType =
  | 'decision' | 'constraint' | 'warning'
  | 'source'   | 'reference'  | 'file'
  | 'question' | 'finding';            // finding = agent write-back

interface LibraryItem {
  id: string;
  project: string;
  type: ItemType;
  title: string;
  body: string;
  brief?: string;          // precomputed compressed form (the Brief layer)
  topic: string;
  tags: string[];
  importance: 1|2|3|4|5;
  confidence: number;      // 0..1 — how sure are we this is true/current
  stale: boolean;          // Archive-only; never auto-packed
  always: boolean;         // do-not-break; reserved into every pack for project
  files: string[];
  source?: string;
  supersedes?: string[];   // ids this replaces (knowledge evolves)
  related?: string[];      // graph edges
  provenance: 'manual'|'extracted'|'agent';
  createdAt: string;
  updatedAt: string;
  embedding?: number[];    // populated by index
}
```

**Pack output** is not just text — it carries a `trace` (per-item score
breakdown) and a `budget` accounting so packs are inspectable and testable.

---

## 5. Retrieval pipeline (the moat, detailed)

1. **Scope.** Hard filter by project (and access policy, when hosted).
2. **Candidate generation.** Hybrid: BM25 (lexical) ⊕ vector kNN (semantic),
   fused with Reciprocal Rank Fusion. Cheap, high recall.
3. **Rerank.** Cross-encoder or LLM rerank of top-K (Claude Haiku for cheap,
   Sonnet for hard cases; prompt caching to cut cost).
4. **Structural scoring.** Blend in type weight, importance, freshness decay,
   confidence, and graph relatedness (items linked to already-chosen items get a
   boost — the ATLAS knowledge-graph heritage).
5. **Pack (budget knapsack).**
   - Reserve `always` items first — but enforce the reserved-items cap (§2.4):
     if they exceed the Brief-tier ceiling, error + emit a library-health lint.
   - Greedily fill remaining budget by blended score.
   - If an item is too big, use its `brief`, or compress on the fly (cached).
   - Exclude `stale` (Archive — `expand` only).
6. **Assemble** into canonical sections (Goal / Decisions / Constraints / Files /
   Warnings / Open Questions / Sources) + token accounting + trace.

**Layers = budget tiers:** Brief (~400) · Pack (~2.5k) · Dossier (~8k) ·
Sources (on demand) · Archive (never auto).

---

## 6. Evaluation strategy (build this in Phase 1, not later)

The product is only as good as the pack. Measure it.

- **Experiment #1 — run before building the moat: Pack-vs-dump on
  task-success.** Three arms on the same tasks: (a) full **dump** (~8k, all
  project items), (b) budget-matched **naive** top-k (~2.5k, similarity only, no
  structure), (c) budget-matched **Pack** (~2.5k, structured). Two outcomes that
  matter: *Pack > dump* on task-success proves the quality wedge (not just cost);
  *Pack > naive* proves the edge is **structure**, not mere truncation (anyone
  can truncate). If "less is more" doesn't appear here, change the positioning
  *before* building the index. This is the gating experiment, not a late metric.
- **Golden set:** 20–50 `(task, project) → {must-have ids, nice-to-have ids,
  must-not-include ids}` cases. Start with hand-authored Bouncr cases; grow it.
  *Caveat:* at this N with subjective labels and LLM-judge variance, early
  numbers are **directional only** — trust recall@budget as a proxy *only once it
  correlates with task-success* on real cases; growing the set is a first-class
  chore, not a someday.
- **Metrics:**
  - *Mandatory coverage* — 100% of `always` items present (hard gate).
  - *Recall@budget* — fraction of must-have items that made the pack.
  - *Noise ratio* — fraction of packed items not in must/nice sets.
  - *Token efficiency* — must-have coverage per 1k tokens.
  - *Task success (downstream)* — give an agent the pack on a fixed task set;
    LLM-judge whether it completed correctly. The metric that actually matters.
  - *Expand-precision* — when the agent calls `expand`, was the returned item
    actually load-bearing for success? Guards against a silent failure: declining
    `expand` calls only count as *good* when **task-success holds** — otherwise
    they may mean starved agents proceeding confidently, not smarter packs. The
    pack's "map" must therefore name what it's withholding and the trigger to
    fetch it, so expanding is a designed affordance, not a hope.
  - *Latency & cost per pack.*
- **Regression harness:** every index change runs the suite; CI fails on
  regression. This is the discipline that makes the moat compound.

---

## 7. Phased roadmap

Each phase: **deliverables · success criteria (exit gate) · primary risk.**

### Phase 0 — Foundation (lock the idea & the rails)
- **Deliverables:** this roadmap; finalized data model & repo structure; tech-
  stack decision (§8); CI + test scaffold; eval harness skeleton with 5 seed
  golden cases; the existing v0 prototype tagged as the reference baseline.
- **Exit gate:** data model frozen; `eval` command runs and prints metrics on
  the v0 engine.
- **Risk:** over-designing. Keep it to schema + harness, nothing fancy.

### Phase 1 — Local MCP MVP (the dogfood release)
- **Deliverables:**
  - TypeScript rewrite of the engine against the typed schema.
  - Filesystem library loader (markdown), watch/reload. **Normalize at load:**
    fill schema-optional fields with defaults so the engine never sees an absent
    field — `createdAt/updatedAt` derived from `updated`, `confidence` defaulted,
    edges → `[]`, and **`provenance: 'manual'` stamped on every existing item**
    before any `agent`/`extracted` item enters (the "never auto-trust extracted"
    promise can't be enforced if half the library is provenance-`undefined`).
  - Hybrid retrieval v1 (BM25 + structural; embeddings optional via API).
  - **Adversarial test project + task-success judge** — the seed library is too
    small for `pack == dump`, so Experiment #1's kill-switch can't fire on it.
    Build a deliberately bloated project (8k+ of mostly-irrelevant items) and wire
    the LLM task-success judge so `pack` vs `dump` is finally a *quality* verdict,
    not just id-overlap. This is the gate that validates (or kills) the thesis.
  - `pack / expand / sources / related` as an **MCP server** + CLI.
  - **`remember()` write-back** (pulled forward from Phase 3): an agent can save a
    `finding` into the library mid-session. Plain append + dedup only — no
    auto-extraction, no inference; keeps garbage-in risk near zero.
  - Golden set grown to ~20 cases; regression harness in CI.
  - Permissive license (open-core) + minimal README/install so it's installable
    by a stranger, not just you.
- **Exit gate:** install in Claude Code, point at a real repo's library, and an
  agent completes a real task using packs — and you'd rather use it than not.
  Recall@budget and mandatory coverage tracked and green.
- **Risk:** MCP integration friction. Mitigate by dogfooding on RRSRCH itself.

### Phase 2 — Retrieval quality (deepen the moat)
- **Deliverables:**
  - ✅ Per-item `brief` + on-the-fly compression to fit budget (two-pass packer:
    smallest-form-first for coverage, upgrade-to-full for detail).
  - ✅ Graph-relatedness boost using `related` edges (neighbors of strong matches
    are lifted) + supersession-aware exclusion via `supersedes` edges.
  - ✅ Embeddings behind a provider interface — keyless deterministic default
    (char-n-gram hashing) doing **vector recall-expansion** (adds must-haves
    lexical missed without re-ranking the winners; opt-in via `RRSRCH_EMBED`).
    Seams left for a local neural model (Transformers.js MiniLM) + `sqlite-vec`
    store at scale; Voyage/OpenAI are one-provider swaps.
  - ⏳ LLM/cross-encoder rerank of top-K (Claude, prompt-cached).
- **Exit gate (revised):** the Phase-1 eval had **no recall@budget headroom** (the
  2.5k budget never bit), so a new budget-that-bites case (`06-...-tight`) was
  added first. Lift is now measurable there: pack holds mandatory-coverage 100%
  (naive 0%), recall 100% (naive 50%), noise 0%, token-efficiency 6.64 vs 3.34, at
  ~1/10 of dump's tokens — no regression on the original 10 (byte-identical to
  `baseline.txt`). Remaining: semantic lift on paraphrased queries (embeddings) +
  task-success once the judge runs.
- **Risk:** cost/latency creep. Cache aggressively; keep a deterministic
  fast-path so packs never *require* an LLM call. *(Held: the whole deterministic
  slice above ships with zero network/LLM/embedding calls.)*

### Phase 3 — Ingestion & authoring (kill the adoption tax)
- **Deliverables:**
  - Auto-extract candidate items from a repo (README, ADRs, docs, code comments).
  - Extract from agent transcripts/sessions.
  - Dedup + conflict/supersession detection + staleness flagging.
  - (`remember()` write-back already shipped in Phase 1 — here it gains
    extraction/enrichment, not basic capture.)
  - Lightweight human review queue for extracted items.
- **Exit gate:** a user goes from empty → useful library on a new project in
  minutes without hand-writing notes.
- **Risk:** garbage-in (bad extractions poison packs). Gate with confidence
  scores + review queue; never auto-trust extracted items at high importance.

### Phase 4 — Hosted, team & multi-tenant
- **Deliverables:**
  - SQLite → Postgres + pgvector; migrations.
  - HTTP API + auth; project/tenant isolation; access policy.
  - **Secrets redaction** (never pack secret values; the floor_price/target_price
    guarantee productized) — a headline feature, not an afterthought.
  - Web UI: browse/edit library, inspect what's packed + trace, usage analytics.
  - Telemetry feedback loop: `expand` calls = "pack was missing something" →
    tuning signal.
- **Exit gate:** a team shares a library across members & agents with isolation
  and audit; expansions trend down over time (packs getting smarter).
- **Risk:** premature SaaS complexity. Don't start until Phases 1–3 are loved by
  solo users.

### Phase 5 — Scale & ecosystem
- **Deliverables:** multi-agent context routing; cross-project knowledge;
  caching/perf; integrations beyond MCP (Cursor/Codex/LangChain adapters);
  packaging, pricing, GTM.
- **Exit gate:** retention + word-of-mouth; defensible eval lead.
- **Risk:** spreading thin across integrations before the core is undeniably good.

---

## 8. Tech stack (recommendations)

| Concern        | Recommendation | Why |
|----------------|----------------|-----|
| Core language  | **TypeScript** | MCP ecosystem is TS-first; `npx` distribution; users live in JS/TS agent tooling. |
| Storage        | FS (md+git) → **SQLite** (local) → **Postgres + pgvector** (hosted) | Inspectable & versioned early; scales later without rearchitecting. |
| Vectors        | **Voyage AI** embeddings (Anthropic-recommended) or local `sqlite-vec` | Quality + flexibility; pluggable provider interface. |
| LLM tasks      | **Claude** — Haiku 4.5 for high-volume extraction/summarization, Sonnet 4.6 for hard reranks; **prompt caching** | Cost/quality fit; caching makes per-item LLM ops cheap. |
| Lexical search | BM25 (e.g. via SQLite FTS5) | Cheap, strong recall, fuses well with vectors. |
| Distribution   | **MCP server** first; SDK + CLI alongside | Meets users where their agents already are. |

*(Keep the deterministic scorer as a no-dependency fast-path so the product
works — and tests — without any network/LLM/embedding calls.)*

---

## 9. Top risks & mitigations

1. **Retrieval just isn't good enough** → eval harness from Phase 1; dogfood
   relentlessly; treat it as an IR problem with metrics.
2. **Authoring burden kills adoption** → Phase 3 auto-extraction + write-back;
   make empty→useful fast.
3. **Stale/wrong knowledge poisons agents** → freshness decay, `confidence`,
   `supersedes`, Archive isolation, review queue for extractions.
4. **Commoditization (vector DBs, framework-native memory)** → differentiate on
   budget discipline + structure + safety guarantees + MCP-native + eval lead.
5. **Scope creep** → thin slices with hard exit gates; no Phase N+1 work until
   Phase N is dogfooded and loved.
6. **Cost/latency of LLM in the hot path** → deterministic fast-path always
   available; cache embeddings, briefs, reranks.

---

## 10. Decisions

All six settled (1, 4, 6 below resolved in planning).

2. **ICP → solo coding-agent users.** Reachable, self-serve, daily pain. Teams
   reuse the same engine + isolation later; don't split focus.
3. **Embeddings → local-default, paid-pluggable.** Phase 1 ships on BM25 +
   structural with **zero** embeddings. Phase 2 adds local `sqlite-vec` as
   default behind a provider interface; Voyage is a one-line swap and is used in
   *eval* to find the quality ceiling — but a key is never required to try it.
5. **ATLAS → harvest the mechanism, retire the content.** Keep the
   graph-relatedness edge-boost (§5) as a first-class scorer; retire the old site
   and the model/GPU ranking content and three.js code. Reuse the *idea*, not the
   artifact.

1. **Business shape → open-core.** Core (engine + MCP server + eval harness) is
   permissively licensed from commit one; hosted/team/isolation (Phase 4) is the
   business but stays separable and later. The open eval harness is a credibility
   flex. Pricing deferred.
4. **Authoring tax → partial (write-back early).** Full auto-extraction stays in
   Phase 3, but `remember()` write-back is **pulled forward to Phase 1** so the
   library grows from agent findings as you work — no manual-note tax, no
   garbage-in risk yet. Hand-authoring the seed library remains the golden-set work.
6. **Name/repo → RRSRCH *is* the tool.** This product is the canonical RRSRCH
   going forward. The existing news site stays live and untouched for now;
   pointing rrsrch.com at the tool is a deliberate later task, out of scope for
   Phases 0–1. Everything lives in this repo; no rename, no migration now.

---

## Appendix — current status

- v0 prototype lives in `backpack/` (`lib/engine.js`, `cli.js`, `library/`).
- Demonstrates: budget-aware packing, `always`-item reservation surviving
  compression, stale→Archive isolation, project scoping, progressive disclosure.
- It is the **reference baseline** the eval harness measures against in Phase 0.
