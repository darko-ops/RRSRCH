// Phase 3 ingestion: deterministic repo extraction → review queue → accept/reject.
// The load-bearing guarantee is QUARANTINE: extracted candidates land in the
// review queue, are provenance='extracted' with capped importance, and CANNOT
// enter a pack until a human accepts them. Everything runs on temp dirs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFromRepo, stageCandidates, listReview, acceptCandidate, rejectCandidate } from '../lib/ingest.js';
import { loadLibrary, pack } from '../lib/engine.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const VALIDATOR = join(HERE, '..', 'schema', 'validate.mjs');

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'rrsrch-repo-'));
  mkdirSync(join(root, 'docs', 'adr'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'README.md'), '# Acme Service\n\nAcme handles billing webhooks and payouts for merchants.\n');
  writeFileSync(join(root, 'docs', 'adr', '001-use-postgres.md'), '# Use Postgres\n\n## Decision\n\nWe use Postgres as the primary datastore for all tenant data.\n');
  writeFileSync(join(root, 'src', 'pay.js'), [
    'function charge() {',
    '  // TODO: handle partial refunds before GA',
    '  // WARNING: never log the raw card number here',
    '  return 1;',
    '}',
  ].join('\n'));
  return root;
}

const withTmp = (fn) => {
  const review = mkdtempSync(join(tmpdir(), 'rrsrch-review-'));
  const library = mkdtempSync(join(tmpdir(), 'rrsrch-lib-'));
  const repo = makeRepo();
  try { fn({ review, library, repo }); }
  finally { for (const d of [review, library, repo]) rmSync(d, { recursive: true, force: true }); }
};

test('extractor finds an ADR decision, a doc reference, and code-comment items', () => {
  withTmp(({ repo }) => {
    const { candidates } = extractFromRepo(repo, 'Acme');
    const types = candidates.map((c) => c.type);
    assert.ok(candidates.some((c) => c.type === 'decision' && /postgres/i.test(c.title)), 'ADR → decision');
    assert.ok(candidates.some((c) => c.type === 'question' && /refund/i.test(c.body)), 'TODO → question');
    assert.ok(candidates.some((c) => c.type === 'warning' && /card number/i.test(c.body)), 'WARNING → warning');
    // Every candidate is quarantined: extracted, low confidence, capped importance.
    for (const c of candidates) {
      assert.equal(c.provenance, 'extracted');
      assert.ok(c.confidence <= 0.5);
      assert.ok(c.importance <= 2, 'never high importance');
      assert.ok(!c.always && !c.stale);
    }
    assert.ok(types.length >= 3);
  });
});

test('staged candidates land in review, NOT the library, and are invisible to pack()', () => {
  withTmp(({ review, library, repo }) => {
    const { candidates } = extractFromRepo(repo, 'Acme');
    const { staged } = stageCandidates({ reviewRoot: review, libraryRoot: library, project: 'Acme', candidates });
    assert.ok(staged >= 3);
    assert.equal(loadLibrary(library).length, 0, 'nothing written to the library');
    const queued = listReview(review, 'Acme');
    assert.equal(queued.length, staged);
    // The pack engine reads the library only → a queued candidate cannot leak in.
    const packed = pack({ library: loadLibrary(library), task: 'handle webhooks and refunds', project: 'Acme', token_budget: 2500 });
    assert.equal(packed.items.length, 0, 'review queue is quarantined from packs');
  });
});

test('staging is idempotent (re-extract dedupes against the queue)', () => {
  withTmp(({ review, library, repo }) => {
    const a = stageCandidates({ reviewRoot: review, libraryRoot: library, project: 'Acme', candidates: extractFromRepo(repo, 'Acme').candidates });
    const b = stageCandidates({ reviewRoot: review, libraryRoot: library, project: 'Acme', candidates: extractFromRepo(repo, 'Acme').candidates });
    assert.ok(a.staged >= 3);
    assert.equal(b.staged, 0, 'second run stages nothing new');
    assert.equal(b.skipped, a.staged);
  });
});

test('accept moves a candidate into the library (lint-clean); reject discards it', () => {
  withTmp(({ review, library, repo }) => {
    stageCandidates({ reviewRoot: review, libraryRoot: library, project: 'Acme', candidates: extractFromRepo(repo, 'Acme').candidates });
    const queued = listReview(review, 'Acme');
    const accept = queued[0].id, reject = queued[1].id;

    acceptCandidate({ reviewRoot: review, libraryRoot: library, project: 'Acme', id: accept });
    rejectCandidate({ reviewRoot: review, project: 'Acme', id: reject });

    const lib = loadLibrary(library);
    assert.ok(lib.some((i) => i.id === accept), 'accepted item now in library');
    assert.ok(!listReview(review, 'Acme').some((i) => i.id === accept), 'accepted item left the queue');
    assert.ok(!listReview(review, 'Acme').some((i) => i.id === reject), 'rejected item gone');
    // The accepted, now-live item must satisfy the frozen schema.
    execFileSync(process.execPath, [VALIDATOR, library], { stdio: 'pipe' });
  });
});

test('accepted extracted items are reachable by pack once in the library', () => {
  withTmp(({ review, library, repo }) => {
    stageCandidates({ reviewRoot: review, libraryRoot: library, project: 'Acme', candidates: extractFromRepo(repo, 'Acme').candidates });
    const adr = listReview(review, 'Acme').find((i) => /postgres/i.test(i.title));
    acceptCandidate({ reviewRoot: review, libraryRoot: library, project: 'Acme', id: adr.id });
    const packed = pack({ library: loadLibrary(library), task: 'choose the datastore (postgres)', project: 'Acme', token_budget: 2500 });
    assert.ok(packed.items.some((i) => i.id === adr.id), 'accepted ADR is now packable');
  });
});
