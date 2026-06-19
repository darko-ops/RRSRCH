// RRSRCH — the backpack for agents.
// Core engine: load a Library, build an Index, and assemble token-budgeted
// Context Packs. The whole product philosophy lives here — give the agent the
// SMALLEST useful bundle for the task, plus pointers to get more on demand.

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

// ---------------------------------------------------------------------------
// Token accounting. A char/4 heuristic keeps v0 dependency-free; swap in a real
// tokenizer later without touching the selection logic.
// ---------------------------------------------------------------------------
export const estimateTokens = (text) => Math.ceil((text || '').length / 4);

// ---------------------------------------------------------------------------
// Frontmatter. A deliberately tiny YAML subset: `key: value` scalars and inline
// `key: [a, b, c]` arrays. Enough to describe a library item, nothing more.
// ---------------------------------------------------------------------------
function parseFrontmatter(raw) {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw.trim() };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let val = kv[2].trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (val === 'true' || val === 'false') {
      val = val === 'true';
    } else {
      val = val.replace(/^["']|["']$/g, '');
    }
    meta[key] = val;
  }
  return { meta, body: m[2].trim() };
}

// ---------------------------------------------------------------------------
// The Library + Index. Every note, decision, constraint, source lives on disk
// as a markdown file with frontmatter. We load them all into an in-memory index
// so retrieval can reason over structure (type, importance, freshness), not just
// raw text similarity.
// ---------------------------------------------------------------------------
export function loadLibrary(root) {
  const items = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (extname(p) === '.md') {
        const { meta, body } = parseFrontmatter(readFileSync(p, 'utf8'));
        items.push({
          id: meta.id || name.replace(/\.md$/, ''),
          project: meta.project || 'unknown',
          type: meta.type || 'reference', // decision|constraint|warning|source|reference|file|question
          title: meta.title || meta.id || name,
          topic: meta.topic || '',
          tags: Array.isArray(meta.tags) ? meta.tags : meta.tags ? [meta.tags] : [],
          importance: Number(meta.importance ?? 3), // 1..5
          stale: meta.stale === true,
          always: meta.always === true, // "do-not-break" — always carried for its project
          files: Array.isArray(meta.files) ? meta.files : meta.files ? [meta.files] : [],
          source: meta.source || '',
          updated: meta.updated || '',
          body,
          path: p,
        });
      }
    }
  };
  walk(root);
  return items;
}

// ---------------------------------------------------------------------------
// Relevance scoring — the real moat. Term overlap between the task and an item's
// searchable text, weighted by type, importance, and freshness. Deterministic
// and inspectable on purpose: you can see WHY each item made the pack.
// ---------------------------------------------------------------------------
const STOP = new Set(('the a an of to for in on and or with without into at by ' +
  'is are be do does update implement add change fix use using via from this that').split(' '));

const tokenize = (s) => (s || '').toLowerCase().match(/[a-z0-9_]+/g) || [];

const TYPE_WEIGHT = {
  warning: 1.6, constraint: 1.4, decision: 1.3,
  file: 1.1, reference: 1.0, source: 0.7, question: 1.2,
};

function score(item, taskTerms) {
  const hay = tokenize([item.title, item.topic, item.tags.join(' '), item.body].join(' '));
  const hayset = new Set(hay);
  let overlap = 0;
  for (const t of taskTerms) if (hayset.has(t)) overlap += 1;
  const base = overlap / Math.max(taskTerms.length, 1);
  const typed = base * (TYPE_WEIGHT[item.type] ?? 1);
  const importanceBoost = 1 + (item.importance - 3) * 0.12;
  const stalePenalty = item.stale ? 0.55 : 1;
  return typed * importanceBoost * stalePenalty;
}

// ---------------------------------------------------------------------------
// pack() — the killer function. Given a task, a project, and a token budget,
// return the minimum useful bundle: warnings that must always travel, then the
// highest-value items greedily packed until the budget is spent.
// ---------------------------------------------------------------------------
export function pack({ library, task, project, token_budget = 2500, goal }) {
  const taskTerms = tokenize(task).filter((t) => !STOP.has(t));
  const pool = library.filter((i) => i.project === project);

  const scored = pool
    .map((i) => ({ item: i, s: score(i, taskTerms) }))
    .sort((a, b) => b.s - a.s);

  const chosen = [];
  let used = 0;
  const take = (entry) => {
    const cost = estimateTokens(entry.item.body) + 12; // +heading overhead
    if (used + cost > token_budget) return false;
    chosen.push(entry.item);
    used += cost;
    return true;
  };

  // 1) Always carry the "do-not-break" items for this project.
  for (const e of scored) if (e.item.always) take(e);
  // 2) Then fill remaining budget by relevance. Skip zero-signal noise and
  //    stale items — stale lives in the Archive layer, reachable only via
  //    expand(), never auto-carried into a pack.
  for (const e of scored) {
    if (e.item.always) continue;
    if (e.s <= 0 || e.item.stale) continue;
    take(e);
  }

  return assemble({ task, project, goal, items: chosen, used, budget: token_budget });
}

// Bucket selected items into the canonical Context Pack shape.
function assemble({ task, project, goal, items, used, budget }) {
  const by = (t) => items.filter((i) => i.type === t);
  const files = [...new Set(items.flatMap((i) => i.files))];
  const sources = [...new Set(items.filter((i) => i.source).map((i) => i.source))];

  const section = (label, rows) =>
    rows.length ? `\n${label}:\n${rows.map((r) => `- ${r}`).join('\n')}` : '';

  const text =
    `Context Pack: ${project} — ${task}\n` +
    `\nGoal:\n${goal || by('decision')[0]?.body || task}` +
    section('Relevant Decisions', by('decision').map((i) => i.body)) +
    section('Constraints', by('constraint').map((i) => i.body)) +
    section('Likely Files', files) +
    section('Warnings', by('warning').map((i) => i.body)) +
    section('Open Questions', by('question').map((i) => i.body)) +
    section('Sources', sources) +
    `\n\n[pack: ${used}/${budget} tokens · ${items.length} items · expand("topic") for more]`;

  return { text, used, budget, items };
}

// ---------------------------------------------------------------------------
// Progressive disclosure. The agent starts with a small pack and pulls more
// ONLY when it needs to — the backpack with a map, not the whole library.
// ---------------------------------------------------------------------------
export function expand({ library, project, query, limit = 5 }) {
  const terms = tokenize(query).filter((t) => !STOP.has(t));
  return library
    .filter((i) => i.project === project)
    .map((i) => ({ item: i, s: score(i, terms) }))
    .filter((e) => e.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((e) => e.item);
}

export const sources = ({ library, project, query }) =>
  expand({ library, project, query, limit: 10 }).filter((i) => i.source);

export const related = ({ library, project, query }) =>
  expand({ library, project, query, limit: 8 });

// ---------------------------------------------------------------------------
// remember() — agent write-back. An agent that learned something durable during
// a session saves it as a `finding` so the next task inherits it. Deliberately
// dumb: plain capture + dedup, NO extraction or inference (garbage-in risk near
// zero — ROADMAP §10.4). The result is a normal library file the same engine
// packs, lints, and evals; write-back gets no special trust.
// ---------------------------------------------------------------------------
const slugify = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'finding';

// Normalize body for dedup: an agent re-learning the same fact must NOT spawn a
// near-identical file every session.
const normalizeBody = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Tiny frontmatter serializer — emits exactly the subset the parser/validator
// understand (scalars, inline string arrays, booleans). Order is cosmetic.
function serialize(meta, body) {
  // Optional fields are omitted when empty; required schema fields (topic, tags)
  // are ALWAYS emitted — even empty — so write-back can never produce a file the
  // linter rejects.
  const opt = (k, v) => {
    if (v === undefined || v === null || v === '') return null;
    if (Array.isArray(v)) return v.length ? `${k}: [${v.join(', ')}]` : null;
    return `${k}: ${v}`;
  };
  const fm = [
    `id: ${meta.id}`,
    `project: ${meta.project}`,
    `type: ${meta.type}`,
    `title: ${meta.title}`,
    `topic: ${meta.topic || ''}`,
    `tags: [${(meta.tags || []).join(', ')}]`,
    `importance: ${meta.importance}`,
    opt('files', meta.files),
    opt('source', meta.source),
    opt('related', meta.related),
    `provenance: ${meta.provenance}`,
    `updated: ${meta.updated}`,
  ].filter(Boolean);
  return `---\n${fm.join('\n')}\n---\n${body.trim()}\n`;
}

export function remember({
  libraryRoot,
  project,
  title,
  body,
  type = 'finding',
  topic = '',
  tags = [],
  files = [],
  source = '',
  importance = 3,
  related = [],
  now = new Date().toISOString().slice(0, 10),
}) {
  if (!project) throw new Error('remember: project is required');
  if (!title || !title.trim()) throw new Error('remember: title is required');
  if (!body || !body.trim()) throw new Error('remember: body is required');

  // Dedup against what's already on disk for this project.
  const existing = loadLibrary(libraryRoot).filter((i) => i.project === project);
  const want = normalizeBody(body);
  const dup = existing.find((i) => normalizeBody(i.body) === want);
  if (dup) return { item: dup, path: dup.path, created: false };

  // Unique kebab-case id within the project.
  const taken = new Set(existing.map((i) => i.id));
  let id = slugify(title);
  if (taken.has(id)) {
    let n = 2;
    while (taken.has(`${id}-${n}`)) n += 1;
    id = `${id}-${n}`;
  }

  const meta = {
    id,
    project,
    type,
    title: title.trim(),
    topic: topic.trim(),
    tags: (Array.isArray(tags) ? tags : [tags]).filter(Boolean),
    importance: Math.max(1, Math.min(5, Number(importance) || 3)),
    files: (Array.isArray(files) ? files : [files]).filter(Boolean),
    source: source.trim(),
    related: (Array.isArray(related) ? related : [related]).filter(Boolean),
    provenance: 'agent',
    updated: now,
  };

  const dir = join(libraryRoot, project.toLowerCase());
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, `${id}.md`);
  writeFileSync(path, serialize(meta, body), 'utf8');

  return { item: { ...meta, body: body.trim(), path }, path, created: true };
}
