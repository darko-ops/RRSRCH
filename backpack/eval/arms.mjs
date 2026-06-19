// The three arms of Experiment #1 (ROADMAP §6). Same task, same budget; the only
// variable is HOW context is selected. The experiment answers two questions the
// moment a task-success judge exists, and answers id-overlap questions already:
//   pack  vs  dump  → is "less is more"? (quality wedge, not just cost)
//   pack  vs  naive → is the edge STRUCTURE, or just truncation? (anyone truncates)
//
// Each arm returns { name, ids: string[], tokens }.

import { pack, estimateTokens } from '../lib/engine.js';
import { defaultProvider } from '../lib/embed.js';

// Same cheap tokenizer/stoplist the engine uses, kept local so `naive` is a
// faithful "dump into similarity search" baseline with NO structural signals.
const STOP = new Set(('the a an of to for in on and or with without into at by ' +
  'is are be do does update implement add change fix use using via from this that').split(' '));
const tokenize = (s) => (s || '').toLowerCase().match(/[a-z0-9_]+/g) || [];

const cost = (item) => estimateTokens(item.body) + 12; // match the packer's per-item overhead

// Plain concatenation of selected item texts — how the baseline arms "dump into
// the prompt". The `pack` arm uses the engine's structured assembly instead;
// that structure is part of what the experiment tests.
const assemble = (project, items) =>
  `Context for project ${project}:\n\n` +
  items.map((i) => `- [${i.type}] ${i.title}\n  ${i.body}`).join('\n\n');

// pack — the real engine: project-scoped, always-reserved, structurally scored,
// stale excluded to Archive.
export function packArm(library, c) {
  const r = pack({ library, task: c.task, project: c.project, token_budget: c.budget });
  return { name: 'pack', ids: r.items.map((i) => i.id), tokens: r.used, text: r.text };
}

// dump — "give it everything (scoped)". All non-stale items for the project, up
// to a generous ceiling. High recall, high noise, high token cost.
export function dumpArm(library, c, ceiling = 8000) {
  const chosen = [];
  let used = 0;
  for (const item of library.filter((i) => i.project === c.project && !i.stale)) {
    const k = cost(item);
    if (used + k > ceiling) break;
    chosen.push(item); used += k;
  }
  return { name: 'dump', ids: chosen.map((i) => i.id), tokens: used, text: assemble(c.project, chosen) };
}

// naive — "dump into vector search, similarity only". Pure lexical overlap across
// the WHOLE library (no project scope), INCLUDING stale, no type/importance/always
// weighting, greedily truncated to budget. This is the baseline the product critiques.
export function naiveArm(library, c) {
  const terms = tokenize(c.task).filter((t) => !STOP.has(t));
  const scored = library
    .map((item) => {
      const hay = new Set(tokenize([item.title, item.topic, item.tags.join(' '), item.body].join(' ')));
      let overlap = 0;
      for (const t of terms) if (hay.has(t)) overlap += 1;
      return { item, s: overlap / Math.max(terms.length, 1) };
    })
    .filter((e) => e.s > 0)
    .sort((a, b) => b.s - a.s);

  const chosen = [];
  let used = 0;
  for (const { item } of scored) {
    const k = cost(item);
    if (used + k > c.budget) continue; // truncate to budget, keep scanning smaller items
    chosen.push(item); used += k;
  }
  return { name: 'naive', ids: chosen.map((i) => i.id), tokens: used, text: assemble(c.project, chosen) };
}

// embed — the pack engine with the keyless vector recall-expansion enabled. Same
// guarantees as pack; on a well-tagged library it tends to parity, with upside on
// paraphrase / morphological-miss queries (proven in test/embed.test.mjs).
export function embedArm(library, c) {
  const r = pack({ library, task: c.task, project: c.project, token_budget: c.budget, embed: defaultProvider.embed });
  return { name: 'embed', ids: r.items.map((i) => i.id), tokens: r.used, text: r.text };
}

export const ARMS = { pack: packArm, naive: naiveArm, dump: dumpArm, embed: embedArm };
