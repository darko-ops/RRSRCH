#!/usr/bin/env node
// `npm run eval` — run the golden set against the v0 engine and print metrics.
//
// Gate discipline (ROADMAP §6): only the `pack` arm is gated, on the two
// GUARANTEES — mandatory-coverage and must-not leakage. The `naive`/`dump` arms
// are baselines; their failures are EXPECTED and informational (that's the point
// of the experiment), so they never fail the build. Quality metrics
// (recall@budget, noise, token-efficiency) are reported, not gated.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLibrary } from '../lib/engine.js';
import { ARMS } from './arms.mjs';
import { evaluate } from './metrics.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const library = loadLibrary(join(HERE, '..', 'library'));

// `always` ids per project — what mandatory-coverage checks against.
const alwaysByProject = {};
for (const i of library) if (i.always) (alwaysByProject[i.project] ??= []).push(i.id);

const cases = readdirSync(join(HERE, 'cases'))
  .filter((f) => f.endsWith('.json')).sort()
  .map((f) => JSON.parse(readFileSync(join(HERE, 'cases', f), 'utf8')));

const pct = (x) => `${(x * 100).toFixed(0)}%`;
const pad = (s, n) => String(s).padEnd(n);

let gateFailures = 0;
const baselineRows = [];

for (const c of cases) {
  const alwaysIds = alwaysByProject[c.project] || [];
  const arms = (c.arms || ['pack']).map((name) => ARMS[name](library, c));

  console.log(`\n● ${c.id} — "${c.task}" [${c.project}, budget ${c.budget}]`);
  console.log('  ' + pad('arm', 7) + pad('mand-cov', 10) + pad('recall', 9) + pad('noise', 8) + pad('leak', 7) + pad('tok-eff', 10) + pad('items', 7) + 'tokens');

  for (const arm of arms) {
    const m = evaluate({
      packedIds: arm.ids, tokens: arm.tokens, alwaysIds,
      must_have: c.must_have || [], nice_to_have: c.nice_to_have || [], must_not_include: c.must_not_include || [],
    });
    const cov = `${m.coverage.ok ? '✓' : '✗'} ${pct(m.coverage.ratio)}`;
    const leak = m.leakage.ok ? '✓' : `✗${m.leakage.leaked.length}`;
    console.log('  ' +
      pad(arm.name, 7) + pad(cov, 10) +
      pad(`${pct(m.recall.ratio)}`, 9) + pad(pct(m.noise.ratio), 8) +
      pad(leak, 7) + pad(m.efficiency.per1k.toFixed(2), 10) +
      pad(m.items, 7) + m.tokens);

    if (arm.name === 'pack') {
      if (!m.coverage.ok) { gateFailures++; console.log(`    ✗ GATE: missing always items: ${m.coverage.missing.join(', ')}`); }
      if (!m.leakage.ok) { gateFailures++; console.log(`    ✗ GATE: must-not leakage: ${m.leakage.leaked.join(', ')}`); }
    }
    baselineRows.push({ case: c.id, arm: arm.name, coverage: m.coverage.ok, recall: m.recall.ratio, noise: m.noise.ratio, leak: m.leakage.leaked, tokens: m.tokens });
  }

  // Experiment #1 read-out: does `pack` exclude decoys the baselines drag in?
  if (arms.length > 1) {
    const get = (n) => baselineRows.filter((r) => r.case === c.id && r.arm === n)[0];
    const p = get('pack'), n = get('naive'), d = get('dump');
    console.log(`    ↳ experiment: pack leak=${p.leak.length} noise=${pct(p.noise)} | naive leak=${n.leak.length} noise=${pct(n.noise)} | dump tokens=${d.tokens} noise=${pct(d.noise)}`);
    console.log('      (structure-vs-truncation is decided on task-success once the Phase 1 judge lands; id-overlap above already shows decoy exclusion.)');
  }
}

console.log(`\n${'─'.repeat(60)}`);
if (gateFailures) {
  console.error(`✗ EVAL FAILED — ${gateFailures} hard-gate violation(s) on the pack arm.`);
  process.exit(1);
}
console.log(`✓ EVAL PASSED — pack arm holds both guarantees (mandatory-coverage, no must-not leakage) across ${cases.length} cases.`);
console.log('  recall@budget / noise / token-efficiency are baseline numbers to beat in Phase 2.');
