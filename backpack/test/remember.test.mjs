// Engine-level test for remember() write-back: it must produce a schema-valid
// file, generate unique ids, and dedup identical findings. Runs against a temp
// library so it never touches the real one. Zero deps (node:test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { remember, loadLibrary } from '../lib/engine.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const VALIDATOR = join(HERE, '..', 'schema', 'validate.mjs');

const withLib = (fn) => {
  const root = mkdtempSync(join(tmpdir(), 'rrsrch-'));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

test('remember writes a schema-valid finding that loads back', () => {
  withLib((root) => {
    const r = remember({
      libraryRoot: root,
      project: 'Demo',
      title: 'Webhooks use the v2 signature header',
      body: 'Inbound webhooks must verify the X-Sig-V2 header, not the legacy one.',
      topic: 'webhook signature security',
      tags: ['webhook', 'security'],
      importance: 4,
    });
    assert.equal(r.created, true);
    assert.equal(r.item.type, 'finding');
    assert.equal(r.item.provenance, 'agent');
    assert.match(r.item.id, /^[a-z0-9][a-z0-9-]*$/); // schema id pattern

    const loaded = loadLibrary(root).filter((i) => i.project === 'Demo');
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].body, r.item.body);

    const raw = readFileSync(r.path, 'utf8');
    assert.match(raw, /^---\n/); // has frontmatter
    assert.match(raw, /updated: \d{4}-\d{2}-\d{2}/); // required freshness field
  });
});

test('remember dedupes an identical body and writes nothing new', () => {
  withLib((root) => {
    const a = remember({ libraryRoot: root, project: 'Demo', title: 'Fact A', body: 'The sky is blue.' });
    const b = remember({ libraryRoot: root, project: 'Demo', title: 'Fact A again', body: '  the SKY is   blue.  ' });
    assert.equal(a.created, true);
    assert.equal(b.created, false);
    assert.equal(b.item.id, a.item.id);
    assert.equal(loadLibrary(root).filter((i) => i.project === 'Demo').length, 1);
  });
});

test('a bare remember (no topic/tags) still passes the library linter', () => {
  withLib((root) => {
    // The required schema fields topic/tags must always be emitted, even empty,
    // or write-back could poison the library with un-lintable files.
    remember({ libraryRoot: root, project: 'Demo', title: 'Bare finding', body: 'A fact with no topic and no tags.' });
    // Throws (non-zero exit) if the written file violates the schema.
    execFileSync(process.execPath, [VALIDATOR, root], { stdio: 'pipe' });
  });
});

test('remember disambiguates colliding ids from same-titled findings', () => {
  withLib((root) => {
    const a = remember({ libraryRoot: root, project: 'Demo', title: 'Same Title', body: 'first body' });
    const b = remember({ libraryRoot: root, project: 'Demo', title: 'Same Title', body: 'second body' });
    assert.notEqual(a.item.id, b.item.id);
    assert.equal(loadLibrary(root).filter((i) => i.project === 'Demo').length, 2);
  });
});
