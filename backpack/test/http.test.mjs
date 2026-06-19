// HTTP API smoke + telemetry. Starts the real server on an ephemeral port, drives
// it with fetch, and checks the redaction guarantee holds over the wire and that
// telemetry records pack/expand events when a sink is set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setSink } from '../lib/telemetry.js';
import { createServer } from '../http/server.js';

const start = (opts) => new Promise((res) => {
  const srv = createServer(opts);
  srv.listen(0, () => res({ srv, base: `http://127.0.0.1:${srv.address().port}` }));
});
const post = (base, path, body) => fetch(base + path, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());

test('health + pack + remember over HTTP, with redaction on the wire', async () => {
  const lib = mkdtempSync(join(tmpdir(), 'rrsrch-http-'));
  const tel = join(lib, 'telemetry.jsonl');
  setSink(tel);
  const { srv, base } = await start({ libraryRoot: lib, project: 'Acme' });
  try {
    const health = await fetch(base + '/health').then((r) => r.json());
    assert.equal(health.ok, true);

    // remember a finding that contains a secret value...
    const rem = await post(base, '/remember', { title: 'env config', body: 'set STRIPE=sk_live_DEADBEEFdeadbeef1234 here', importance: 4 });
    assert.equal(rem.created, true);

    // ...and confirm pack/expand never return the raw secret.
    const packed = await post(base, '/pack', { task: 'env config stripe', budget: 2500 });
    assert.ok(!/sk_live_DEADBEEF/.test(packed.text), 'no secret over the wire');
    const exp = await post(base, '/expand', { query: 'config' });
    assert.ok(!JSON.stringify(exp).includes('sk_live_DEADBEEF'), 'no secret in expand response');

    // telemetry captured both a pack and an expand event.
    assert.ok(existsSync(tel), 'telemetry sink written');
    const kinds = readFileSync(tel, 'utf8').trim().split('\n').map((l) => JSON.parse(l).kind);
    assert.ok(kinds.includes('pack') && kinds.includes('expand'));
  } finally {
    setSink(null);
    srv.close();
    rmSync(lib, { recursive: true, force: true });
  }
});

test('unknown route 404s; missing project 400s', async () => {
  const lib = mkdtempSync(join(tmpdir(), 'rrsrch-http2-'));
  const { srv, base } = await start({ libraryRoot: lib }); // no default project
  try {
    const nf = await fetch(base + '/nope').then((r) => r.status);
    assert.equal(nf, 404);
    const bad = await fetch(base + '/pack', { method: 'POST', body: '{"task":"x"}' });
    assert.equal(bad.status, 400, 'missing project is a 400');
  } finally {
    srv.close();
    rmSync(lib, { recursive: true, force: true });
  }
});
