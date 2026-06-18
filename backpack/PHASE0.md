# Phase 0 — Marching Orders

> **Goal:** lock the rails so Phase 1 is mechanical. Freeze the schema, fix the
> repo layout, stand up an eval harness that runs against the v0 engine, and wire
> Experiment #1 (Pack-vs-naive-vs-dump) as eval case #1.
>
> **Exit gate:** data model frozen in code; `npm run eval` prints metrics on the
> v0 engine for ≥5 golden cases; Experiment #1 produces three comparable arms.
> Nothing "clever" — no embeddings, no LLM, no rewrite.

This is planning made concrete. Execute top-to-bottom; each item is small.

---

## Locked decisions (from planning)

| # | Decision | Consequence for Phase 0 |
|---|----------|-------------------------|
| Business | **Open-core** | Add a permissive `LICENSE` (Apache-2.0 rec) now; keep core dependency-light & separable. |
| ICP | **Solo coding-agent users** | Optimize for "a stranger can install it"; no team/auth concepts anywhere. |
| Embeddings | **Local-default, paid-pluggable** | Phase 0 uses **zero** embeddings. Don't add a vector dep. |
| Authoring | **Write-back early, extraction late** | No extraction in Phase 0. (`remember()` lands Phase 1.) |
| Name/repo | **RRSRCH is the tool; site untouched** | Work stays in this repo under the tool's dir; do **not** touch the news site or `rrsrch.com`. |

---

## 1. Repo layout (decide once, freeze)

The tool is the canonical RRSRCH; the news site stays as-is alongside it. Phase 0
keeps the v0 engine in place and adds a schema + eval harness beside it.

```
backpack/                 # the RRSRCH tool (canonical product going forward)
  lib/engine.js           # v0 reference engine (baseline; do not gold-plate)
  cli.js
  library/                # the warehouse (markdown + frontmatter)
    <project>/*.md
  schema/
    item.schema.json      # frozen item schema (source of truth)
    validate.mjs          # lints library files against the schema + always-cap
  eval/
    cases/*.json          # golden cases (incl. experiment-01)
    run.mjs               # `npm run eval` — metrics over a chosen engine
    arms.mjs              # dump / naive-topk / pack arm builders
    metrics.mjs           # recall@budget, mandatory-coverage, noise, tok-eff
  ROADMAP.md
  PHASE0.md               # this file
  LICENSE                 # Apache-2.0 (open-core)
  README.md
```

> Decision recorded: **no rename, no new repo, news site left alone.** Promoting
> `backpack/` to repo root and pointing rrsrch.com at the tool is an explicit
> later task, not Phase 0.

---

## 2. Freeze the data model (the source of truth)

Author `schema/item.schema.json` as the canonical contract — every library file
validates against it; the Phase 1 TS types are generated/derived from it.

Frozen fields (matches §4 of ROADMAP): `id, project, type, title, body, brief?,
topic, tags[], importance(1-5), confidence(0-1), stale, always, files[],
source?, supersedes[], related[], provenance(manual|extracted|agent),
createdAt, updatedAt`.

**Validation rules to encode in `validate.mjs` (these ARE the discipline):**
1. Every file parses; required fields present; enums respected.
2. `id` unique within a project.
3. **Always-cap:** for each project, Σ tokens of `always` items ≤ **Brief tier
   ceiling** (start: 400 tok). Breach → non-zero exit + a clear "too many
   do-not-break items in <project>" message. This is a lint, run in CI.
4. `stale` items are flagged but never block (they're Archive-only at pack time).
5. `supersedes`/`related` ids must resolve to real items (no dangling edges).

**Done when:** `node schema/validate.mjs` passes on the seed library and *fails*
loudly if you mark 3+ big items `always` in one project (prove the cap bites).

---

## 3. Eval harness skeleton

### Golden case format (`eval/cases/*.json`)
```json
{
  "id": "bouncr-stripe-connect",
  "task": "Implement merchant Stripe Connect onboarding",
  "project": "Bouncr",
  "budget": 2500,
  "must_have": ["connect-standard", "secret-key-warning", "price-privacy-warning"],
  "nice_to_have": ["per-deal-prices", "webhook-signature", "files-map"],
  "must_not_include": ["old-charges-api", "obius-revenuecat"]
}
```

### Metrics (`eval/metrics.mjs`) — all computed from item ids in the pack
- **mandatory-coverage** — 100% of project `always` items present (hard gate; a
  failure is a build failure).
- **recall@budget** — |packed ∩ must_have| / |must_have|.
- **noise** — |packed − (must ∪ nice)| / |packed|.
- **must-not leakage** — any `must_not_include` present → fail.
- **token-efficiency** — must-have coverage per 1k tokens.
- *(task-success + expand-precision are Phase 1 — they need an agent loop; leave
  a stub + a TODO so the shape exists.)*

### Experiment #1 as case #1 (`eval/arms.mjs`)
For the gating case, build **three arms** over the same task/project:
- **dump** — all non-stale project items, ~8k budget.
- **naive** — top-k by lexical similarity only (no type/importance/always),
  truncated to ~2.5k.
- **pack** — the real `pack()` at ~2.5k.

`run.mjs` prints the metrics table per arm so the structure-vs-truncation
question is answerable the moment a task-success judge exists. Until then it
reports the id-overlap metrics for all three arms (already meaningful: does
`pack` exclude the decoys that `naive`/`dump` drag in?).

**Done when:** `npm run eval` prints a per-case, per-arm metrics table, exits
non-zero on any mandatory-coverage or must-not leakage failure, and the v0 engine
is recorded as the **baseline** numbers to beat.

---

## 4. Plumbing
- `package.json`: `"eval": "node eval/run.mjs"`, `"lint:lib": "node schema/validate.mjs"`.
- Minimal CI (GitHub Actions): run `lint:lib` + `eval` on push. Green = gate met.
- `LICENSE` (Apache-2.0) + README "install & try in 60s" section.

---

## 5. Explicit non-goals for Phase 0 (resist these)
- ❌ TypeScript rewrite (that's Phase 1).
- ❌ Embeddings / vectors / any network or LLM call.
- ❌ MCP server (Phase 1).
- ❌ `remember()` write-back (Phase 1).
- ❌ Touching the news site / rrsrch.com.
- ❌ Auto-extraction, web UI, auth, Postgres.

Phase 0 is schema + harness + license. If it grows past that, it's scope creep.

---

## 6. Checklist
- [ ] `LICENSE` (Apache-2.0) added.
- [ ] `schema/item.schema.json` frozen; matches ROADMAP §4.
- [ ] `schema/validate.mjs` enforces uniqueness, enums, edges, and the always-cap.
- [ ] Seed library passes validation; a deliberate over-`always` test fails it.
- [ ] `eval/cases/` has ≥5 cases incl. `experiment-01` (3-arm).
- [ ] `eval/metrics.mjs` computes coverage, recall@budget, noise, leakage, tok-eff.
- [ ] `eval/run.mjs` prints per-case/per-arm table; non-zero exit on hard-gate fail.
- [ ] v0 baseline numbers recorded (commit the output).
- [ ] CI runs `lint:lib` + `eval` on push.
- [ ] README "try in 60s" written.

When every box is checked, Phase 0's exit gate is met and Phase 1 (TS engine +
MCP + `remember()`) can begin against a measured baseline.
