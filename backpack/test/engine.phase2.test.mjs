// Phase 2 retrieval mechanisms, isolated on synthetic in-memory libraries so each
// behaviour is proven on its own (not inferred from the golden set). pack() takes
// a library array directly, so no files are needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pack } from '../lib/engine.js';

const item = (o) => ({
  id: o.id, project: 'P', type: o.type || 'reference',
  title: o.title || o.id, topic: o.topic || '', tags: o.tags || [],
  importance: o.importance ?? 3, stale: !!o.stale, always: !!o.always,
  files: [], source: '', supersedes: o.supersedes || [], related: o.related || [],
  brief: o.brief || '', body: o.body || o.id,
});
const ids = (lib, task, budget) => pack({ library: lib, task, project: 'P', token_budget: budget }).items.map((i) => i.id);

test('supersession: a non-stale item that another supersedes is not auto-packed', () => {
  const lib = [
    item({ id: 'new-way', body: 'quasar handling, the current approach', supersedes: ['old-way'] }),
    item({ id: 'old-way', body: 'quasar handling, the previous approach', stale: false }), // explicitly NOT stale
    item({ id: 'other', body: 'quasar unrelated note' }),
  ];
  const got = ids(lib, 'quasar', 2500);
  assert.ok(got.includes('new-way'), 'replacement is packed');
  assert.ok(!got.includes('old-way'), 'superseded item is excluded even though it is not stale');
});

test('graph boost: a lexically-zero item related to a strong anchor gets pulled in', () => {
  const lib = [
    item({ id: 'anchor', body: 'quasar quasar quasar', importance: 5 }),
    item({ id: 'related-weak', body: 'nebula notes', related: ['anchor'] }), // no lexical overlap with task
    item({ id: 'unrelated-weak', body: 'nebula notes too' }),               // identical but no edge
  ];
  const got = ids(lib, 'quasar', 2500);
  assert.ok(got.includes('anchor'));
  assert.ok(got.includes('related-weak'), 'related neighbor of the anchor is boosted into the pack');
  assert.ok(!got.includes('unrelated-weak'), 'an identical but unlinked item stays out');
});

test('compression: an item too big to fit full is included via its brief', () => {
  const big = 'quasar '.repeat(40); // ~280 chars → ~70 tok full
  const lib = [item({ id: 'bulky', body: big, brief: 'quasar: short form' })];
  const r = pack({ library: lib, task: 'quasar', project: 'P', token_budget: 30 }); // < full, > brief
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].id, 'bulky');
  assert.equal(r.items[0].compressed, true, 'included in compressed form');
  assert.ok(r.used <= 30, 'stayed under the tight budget');
});

test('two-pass packer: compress to fit two must-relevant items rather than one full', () => {
  // Full A (big) alone would block B. Compressing both fits both → more coverage.
  const lib = [
    item({ id: 'a', body: 'quasar '.repeat(30), brief: 'quasar A short' }),
    item({ id: 'b', body: 'quasar '.repeat(30), brief: 'quasar B short' }),
  ];
  const got = ids(lib, 'quasar', 60); // not enough for one full body, plenty for two briefs
  assert.deepEqual(got.sort(), ['a', 'b'], 'both items kept by compressing, not one dropped');
});

test('roomy budget upgrades briefs back to full text (no needless compression)', () => {
  const lib = [item({ id: 'x', body: 'quasar full detailed body here', brief: 'quasar short' })];
  const r = pack({ library: lib, task: 'quasar', project: 'P', token_budget: 2500 });
  assert.equal(r.items[0].compressed ?? false, false, 'with budget to spare, the full body is used');
  assert.match(r.items[0].body, /detailed body/);
});
