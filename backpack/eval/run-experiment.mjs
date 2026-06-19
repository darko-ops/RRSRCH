#!/usr/bin/env node
// `npm run experiment` — the Phase 1 KILL-SWITCH.
//
// For each judged case it builds three context arms over the SAME task/budget —
//   dump  : everything for the project (~8k), the "give it all" baseline
//   naive : similarity-only top-k truncated to budget, no structure/scope/staleness
//   pack  : the engine's structured, budget-aware, safety-reserved pack
// — hands each to a solver agent, and an LLM judge scores the resulting plan
// against a fixed rubric (blind to arm). Task-success is the metric that matters.
//
// The verdict that gates Phase 1:
//   pack > naive on task-success  → structure is the moat (not mere truncation)
//   pack >= dump at far fewer tokens → "less is more" holds (quality wedge, not a discount)
// If pack does NOT beat naive, the thesis fails — do not build the MCP server yet.
//
// Requires ANTHROPIC_API_KEY. Deterministic-ish: Sonnet 4.6, temperature 0.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLibrary } from '../lib/engine.js';
import { ARMS } from './arms.mjs';
import { makeClient, SOLVER_MODEL, JUDGE_MODEL } from './judge/client.mjs';
import { solve } from './judge/solver.mjs';
import { judge } from './judge/judge.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const library = loadLibrary(join(HERE, '..', 'library'));

// Only cases carrying a `rubric` are judged (the bloated Helios cases).
const cases = readdirSync(join(HERE, 'cases'))
  .filter((f) => f.endsWith('.json')).sort()
  .map((f) => JSON.parse(readFileSync(join(HERE, 'cases', f), 'utf8')))
  .filter((c) => Array.isArray(c.rubric) && c.rubric.length);

if (!cases.length) {
  console.error('No judged cases found (cases need a "rubric" array).');
  process.exit(1);
}

const client = makeClient();
const ARM_NAMES = ['dump', 'naive', 'pack'];
const scores = { dump: [], naive: [], pack: [] };
const tokens = { dump: [], naive: [], pack: [] };
const pad = (s, n) => String(s).padEnd(n);
const pct = (x) => `${(x * 100).toFixed(0)}%`;

console.log(`Kill-switch experiment — solver=${SOLVER_MODEL} judge=${JUDGE_MODEL} (temp 0)`);
console.log(`${cases.length} judged cases × ${ARM_NAMES.length} arms\n`);

for (const c of cases) {
  console.log(`● ${c.id} — ${c.task}`);
  for (const name of ARM_NAMES) {
    const arm = ARMS[name](library, c);
    try {
      const solution = await solve(client, c.task, arm.text);
      const { score, criteria } = await judge(client, c.task, solution, c.rubric);
      scores[name].push(score);
      tokens[name].push(arm.tokens);
      const grades = criteria.map((x) => `${x.id}:${x.verdict[0]}`).join(' ');
      console.log(`  ${pad(name, 6)} success ${pad(pct(score), 5)} ${pad(`${arm.tokens}tok`, 9)} ${grades}`);
    } catch (err) {
      console.log(`  ${pad(name, 6)} ERROR: ${err.message.split('\n')[0]}`);
    }
  }
  console.log('');
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const meanTok = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);

console.log('═'.repeat(64));
console.log('VERDICT — mean task-success (and mean tokens):');
for (const n of ARM_NAMES) console.log(`  ${pad(n, 6)} ${pad(pct(mean(scores[n])), 6)} @ ${meanTok(tokens[n])} tok`);

const p = mean(scores.pack), na = mean(scores.naive), d = mean(scores.dump);
const delta = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)} pts`;
console.log('');
console.log(`  pack vs naive: ${delta(p - na)}  → ${p > na ? 'structure beats truncation ✓' : 'NO LIFT — the "structure is the moat" thesis is in doubt'}`);
console.log(`  pack vs dump:  ${delta(p - d)}  → ${p >= d ? 'less-is-more holds (≥ dump at far fewer tokens) ✓' : 'dump wins on success — the wedge is cost, not quality'}`);
console.log('');
console.log(p > na
  ? 'KILL-SWITCH PASSED: structure earns task-success. Proceed to the TS engine + MCP.'
  : 'KILL-SWITCH TRIPPED: pack did not beat naive truncation. Rethink the thesis before building the MCP server.');
