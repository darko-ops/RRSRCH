// The keyless embedding provider + vector recall-expansion in pack(). Proves the
// properties the engine relies on: determinism, unit vectors, morphological
// similarity, and that vector recall ADDS misses without displacing lexical
// winners. No network, no model, no key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashEmbed, cosine, defaultProvider } from '../lib/embed.js';
import { pack } from '../lib/engine.js';

const item = (o) => ({
  id: o.id, project: 'P', type: 'reference', title: o.title || o.id, topic: o.topic || '',
  tags: o.tags || [], importance: o.importance ?? 3, stale: false, always: false,
  files: [], source: '', supersedes: [], related: [], brief: '', body: o.body || o.id,
});

test('embeddings are deterministic and L2-normalized', () => {
  const a = hashEmbed('verify the webhook signature');
  const b = hashEmbed('verify the webhook signature');
  assert.deepEqual(Array.from(a), Array.from(b), 'same text → same vector');
  assert.ok(Math.abs(cosine(a, a) - 1) < 1e-6, 'unit vector (self-cosine ≈ 1)');
});

test('morphological variants are closer than unrelated text', () => {
  const q = hashEmbed('webhooks');
  const near = cosine(q, hashEmbed('webhook'));
  const far = cosine(q, hashEmbed('invoice numbering'));
  assert.ok(near > far, `"webhook" (${near.toFixed(2)}) should beat "invoice" (${far.toFixed(2)})`);
  assert.ok(near > 0.2, 'morphological match clears the recall threshold');
});

test('vector recall pulls in a must-have that exact-token matching misses', () => {
  const lib = [
    item({ id: 'hit', body: 'how the webhook receiver works' }),  // task says "webhooks" — no exact token
    item({ id: 'noise', body: 'invoice numbering and credits' }),
  ];
  const task = 'build the webhooks endpoint';
  const lex = pack({ library: lib, task, project: 'P', token_budget: 2500 }).items.map((i) => i.id);
  const emb = pack({ library: lib, task, project: 'P', token_budget: 2500, embed: defaultProvider.embed }).items.map((i) => i.id);
  assert.ok(!lex.includes('hit'), 'lexical alone misses it');
  assert.ok(emb.includes('hit'), 'embeddings recover it');
  assert.ok(!emb.includes('noise'), 'unrelated text stays below threshold');
});

test('vector recall never displaces a strong lexical hit (pure recall gain)', () => {
  // A strong lexical match must keep its place when embeddings are on, even under
  // a tight budget — embeddings only ADD, they do not re-rank the winners.
  const lib = [
    item({ id: 'strong', body: 'quasar quasar quasar quasar', importance: 5 }),
    item({ id: 'vec-only', body: 'webhook receiver', title: 'webhook' }),
  ];
  const got = pack({ library: lib, task: 'quasar', project: 'P', token_budget: 30, embed: defaultProvider.embed }).items.map((i) => i.id);
  assert.ok(got.includes('strong'), 'the lexical winner survives with embeddings on');
});
