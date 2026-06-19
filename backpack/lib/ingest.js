// RRSRCH — ingestion (Phase 3). Kill the adoption tax: point rrsrch at a repo
// and get a useful starter library without hand-writing notes.
//
// The governing risk is garbage-in: a bad extraction reused across packs is worse
// than no note. So extraction is DETERMINISTIC (no LLM, no guessing) and every
// candidate is quarantined:
//   · provenance: 'extracted'      — never confused with manual/agent knowledge
//   · confidence: low (0.3)        — the index can discount it
//   · importance: capped at 2      — never high, never `always`, never `stale`
//   · written to a REVIEW QUEUE    — review/<project>/, NOT library/, so the pack
//                                    engine literally cannot see it until a human
//                                    accepts it into the library.
// "Never auto-trust extracted items" (ROADMAP §3 / §10.4) is thus enforced by
// construction, not by good intentions.

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync, renameSync, rmSync } from 'node:fs';
import { join, extname, basename, relative, sep } from 'node:path';
import { loadLibrary, serialize, slugify, normalizeBody } from './engine.js';

const MAX_CANDIDATES = 300;          // bound the queue; report if we hit it (no silent cap)
const BODY_CAP = 600;                // chars — a candidate is a gist, not a file dump
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'library', 'review', '.vercel']);
const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.go', '.rb', '.java', '.rs', '.c', '.h', '.cpp', '.sh']);

// Comment markers → item type. Warnings/deprecations are louder than TODOs.
const MARKERS = {
  WARNING: 'warning', DEPRECATED: 'warning', HACK: 'warning',
  TODO: 'question', FIXME: 'question', XXX: 'question',
  NOTE: 'reference',
};
const MARKER_RE = new RegExp(
  `(?://|#|/\\*|\\*|<!--|--)\\s*(${Object.keys(MARKERS).join('|')})\\b[:\\s-]*(.+?)\\s*(?:\\*/|-->)?$`,
  'i'
);

const truncate = (s) => (s.length > BODY_CAP ? s.slice(0, BODY_CAP).trimEnd() + '…' : s);
const titleCase = (s) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();

function walk(root) {
  const out = [];
  const rec = (dir) => {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      if (name.startsWith('.') && name !== '.') continue;
      if (SKIP_DIRS.has(name)) continue;
      const p = join(dir, name);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) rec(p);
      else out.push(p);
    }
  };
  rec(root);
  return out;
}

// One candidate per markdown file: its gist. ADRs (by path/heading) → decisions.
function fromMarkdown(path, repoRoot, project, now) {
  const raw = readFileSync(path, 'utf8');
  const rel = relative(repoRoot, path);
  const isAdr = /(^|[/\\])(adr|adrs|decisions)([/\\])/i.test(rel) ||
    /^\d{3,}[-_]/.test(basename(path)) ||
    /^#+\s*(decision|status)\b/im.test(raw);

  const h1 = raw.match(/^#\s+(.+)$/m);
  const title = (h1 ? h1[1] : titleCase(basename(path, '.md'))).trim().slice(0, 80);

  // Body: prefer an ADR Decision/Context section; else the first real paragraph.
  let body = '';
  const decision = raw.match(/^#+\s*(decision|context)\b.*$([\s\S]*?)(?=^#+\s|\Z)/im);
  if (isAdr && decision) body = decision[2].trim();
  if (!body) {
    body = raw
      .replace(/^---[\s\S]*?---\s*/m, '') // strip frontmatter
      .split('\n')
      .filter((l) => l.trim() && !/^#{1,6}\s/.test(l) && !/^[-*]{3,}$/.test(l))
      .join(' ')
      .trim();
  }
  if (!body) return null;

  const tags = [...new Set(rel.split(sep).slice(0, -1).concat(basename(path, '.md').split(/[-_]/)))]
    .map((t) => t.toLowerCase()).filter((t) => /^[a-z][a-z0-9]{2,}$/.test(t)).slice(0, 5);

  return {
    type: isAdr ? 'decision' : 'reference',
    title,
    topic: [title, ...tags].join(' ').toLowerCase().slice(0, 120),
    tags,
    files: [rel],
    body: truncate(body),
    project, provenance: 'extracted', confidence: 0.3, importance: 2,
    updated: now,
  };
}

// Each flagged comment becomes a candidate, tagged with its file.
function fromCode(path, repoRoot, project, now) {
  const rel = relative(repoRoot, path);
  const cands = [];
  let lines;
  try { lines = readFileSync(path, 'utf8').split('\n'); } catch { return cands; }
  lines.forEach((line, idx) => {
    const m = line.match(MARKER_RE);
    if (!m) return;
    const marker = m[1].toUpperCase();
    const text = m[2].trim();
    if (text.length < 4) return; // skip bare "// TODO"
    cands.push({
      type: MARKERS[marker],
      title: `${marker} in ${basename(path)}: ${text.slice(0, 50)}`.slice(0, 80),
      topic: `${marker} ${basename(path)} ${text}`.toLowerCase().slice(0, 120),
      tags: [marker.toLowerCase()],
      files: [`${rel}:${idx + 1}`],
      body: `${marker} (${rel}:${idx + 1}): ${truncate(text)}`,
      project, provenance: 'extracted', confidence: 0.3, importance: 2,
      updated: now,
    });
  });
  return cands;
}

// Scan a repo into candidate items (in memory; nothing written yet).
export function extractFromRepo(repoRoot, project, { now = new Date().toISOString().slice(0, 10) } = {}) {
  const candidates = [];
  let truncated = false;
  for (const path of walk(repoRoot)) {
    if (candidates.length >= MAX_CANDIDATES) { truncated = true; break; }
    const ext = extname(path).toLowerCase();
    if (ext === '.md') { const c = fromMarkdown(path, repoRoot, project, now); if (c) candidates.push(c); }
    else if (CODE_EXT.has(ext)) candidates.push(...fromCode(path, repoRoot, project, now));
  }
  return { candidates: candidates.slice(0, MAX_CANDIDATES), truncated };
}

// Stage candidates into the review queue, deduping against BOTH the live library
// and anything already queued. Returns { staged, skipped, paths }.
export function stageCandidates({ reviewRoot, libraryRoot, project, candidates }) {
  const libBodies = new Set(loadLibrary(libraryRoot).filter((i) => i.project === project).map((i) => normalizeBody(i.body)));
  const queued = existsSync(reviewRoot) ? loadLibrary(reviewRoot).filter((i) => i.project === project) : [];
  const queuedBodies = new Set(queued.map((i) => normalizeBody(i.body)));
  const taken = new Set([
    ...loadLibrary(libraryRoot).filter((i) => i.project === project).map((i) => i.id),
    ...queued.map((i) => i.id),
  ]);

  const dir = join(reviewRoot, project.toLowerCase());
  const paths = [];
  let staged = 0, skipped = 0;
  for (const c of candidates) {
    const norm = normalizeBody(c.body);
    if (libBodies.has(norm) || queuedBodies.has(norm)) { skipped++; continue; }
    queuedBodies.add(norm);
    let id = slugify(c.title);
    if (taken.has(id)) { let n = 2; while (taken.has(`${id}-${n}`)) n += 1; id = `${id}-${n}`; }
    taken.add(id);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const path = join(dir, `${id}.md`);
    writeFileSync(path, serialize({ ...c, id }, c.body), 'utf8');
    paths.push(path);
    staged++;
  }
  return { staged, skipped, paths };
}

export function listReview(reviewRoot, project) {
  if (!existsSync(reviewRoot)) return [];
  return loadLibrary(reviewRoot)
    .filter((i) => !project || i.project === project)
    .sort((a, b) => a.id.localeCompare(b.id));
}

// Accept a queued candidate into the live library (id made unique vs library).
export function acceptCandidate({ reviewRoot, libraryRoot, project, id }) {
  const item = loadLibrary(reviewRoot).find((i) => i.id === id && i.project === project);
  if (!item) throw new Error(`accept: no queued candidate '${id}' in project '${project}'`);
  const taken = new Set(loadLibrary(libraryRoot).filter((i) => i.project === project).map((i) => i.id));
  let newId = id;
  if (taken.has(newId)) { let n = 2; while (taken.has(`${id}-${n}`)) n += 1; newId = `${id}-${n}`; }
  const dir = join(libraryRoot, project.toLowerCase());
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const dest = join(dir, `${newId}.md`);
  if (newId === id) renameSync(item.path, dest);
  else { writeFileSync(dest, readFileSync(item.path, 'utf8').replace(`id: ${id}`, `id: ${newId}`), 'utf8'); rmSync(item.path); }
  return { id: newId, path: dest };
}

export function rejectCandidate({ reviewRoot, project, id }) {
  const item = loadLibrary(reviewRoot).find((i) => i.id === id && i.project === project);
  if (!item) throw new Error(`reject: no queued candidate '${id}' in project '${project}'`);
  rmSync(item.path);
  return { id };
}
