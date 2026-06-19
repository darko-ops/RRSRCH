// Secret redaction — the Phase 4 guarantee. Proves secret VALUES never survive
// into pack/expand output, while non-secret text is left intact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redact, hasSecret } from '../lib/redact.js';
import { pack, expand } from '../lib/engine.js';

const item = (o) => ({
  id: o.id, project: 'P', type: o.type || 'reference', title: o.title || o.id, topic: o.topic || '',
  tags: o.tags || [], importance: o.importance ?? 3, stale: false, always: !!o.always,
  files: [], source: '', supersedes: [], related: [], brief: '', body: o.body,
});

test('redacts common secret shapes, keeps surrounding text', () => {
  const cases = [
    ['use sk_live_abcdef0123456789 ignore', /‹redacted:stripe-key›/],
    ['ANTHROPIC=sk-ant-api03-AAAAAAAAAAAAAAAAAAAA done', /‹redacted:api-key›/],
    ['token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345 here', /‹redacted:github-token›/],
    ['db at postgres://user:hunter2@host/db', /user:‹redacted:url-credentials›@/],
    ['password = hunter2longvalue', /password = ‹redacted:secret›/i],
    ['key -----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY----- x', /‹redacted:private-key›/],
  ];
  for (const [input, expected] of cases) {
    const out = redact(input);
    assert.match(out, expected, `redacted: ${input}`);
    assert.ok(!/hunter2longvalue|ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ|sk_live_abcdef0123/.test(out), `no raw secret left in: ${out}`);
  }
});

test('leaves ordinary technical prose untouched', () => {
  const prose = 'Verify the X-Sig-V2 header and hash identifiers with SHA-256, emitting the first 8 chars.';
  assert.equal(redact(prose), prose);
  assert.equal(hasSecret(prose), false);
});

test('hasSecret flags a stored secret', () => {
  assert.equal(hasSecret('client_secret=abcdef123456'), true);
  assert.equal(hasSecret('just a note about secrets'), false);
});

test('pack() never emits a secret value, even from an always item', () => {
  const lib = [
    // type 'warning' so the body is rendered into the pack text (references aren't).
    item({ id: 'cfg', type: 'warning', always: true, body: 'Set STRIPE=sk_live_DEADBEEFdeadbeef1234 in env.', title: 'config' }),
    item({ id: 'note', body: 'webhook receiver notes', title: 'webhook' }),
  ];
  const r = pack({ library: lib, task: 'webhook config', project: 'P', token_budget: 2500 });
  assert.ok(!/sk_live_DEADBEEF/.test(r.text), 'secret absent from pack text');
  assert.match(r.text, /‹redacted:stripe-key›/, 'placeholder present so the agent knows a secret exists');
  assert.ok(!r.items.some((i) => /sk_live_DEADBEEF/.test(i.body)), 'secret absent from returned items');
});

test('expand() output is redacted too', () => {
  const lib = [item({ id: 'x', body: 'api_key=SUPERSECRETvalue123 for the webhook', title: 'webhook key' })];
  const got = expand({ library: lib, project: 'P', query: 'webhook' });
  assert.ok(!got.some((i) => /SUPERSECRETvalue123/.test(i.body)), 'no secret in expand output');
});
