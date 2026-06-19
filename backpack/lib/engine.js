// RRSRCH — the backpack for agents.
// Core engine: load a Library, build an Index, and assemble token-budgeted
// Context Packs. The whole product philosophy lives here — give the agent the
// SMALLEST useful bundle for the task, plus pointers to get more on demand.

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { cosine } from './embed.js';

// ---------------------------------------------------------------------------
// Token accounting. A char/4 heuristic keeps v0 dependency-free; swap in a real
// tokenizer later without touching the selection logic.
// ---------------------------------------------------------------------------
export const estimateTokens = (text) => Math.ceil((text || '').length / 4);

// Coerce a frontmatter value into a string array (inline arrays parse to arrays,
// a lone scalar to a singleton, missing to []).
const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

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
          files: asArray(meta.files),
          source: meta.source || '',
          // Phase 2 fields: knowledge-graph edges + precomputed compression.
          supersedes: asArray(meta.supersedes), // ids this item replaces
          related: asArray(meta.related),       // graph neighbors
          brief: meta.brief || '',              // precomputed compressed form
          confidence: meta.confidence != null ? Number(meta.confidence) : undefined,
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
// Phase 2 — retrieval-quality machinery, all deterministic and keyless.
//   · supersession  : a replaced item is Archive-only, like stale
//   · graph boost   : items `related` to a strong match get lifted (recall)
//   · compression   : use `brief`/sentence-trim to fit more coverage per token
// ---------------------------------------------------------------------------
const RELATED_BONUS = 0.4;     // additive, as a fraction of the top base score
const ANCHOR_FRACTION = 0.5;   // a "strong match" is ≥ this fraction of top score
const VEC_K = 8;                  // max vector-recalled candidates to admit
const VEC_MIN = 0.2;             // min cosine for a vector candidate (curb noise)
const VEC_RECALL_WEIGHT = 0.3;  // vector-recalled items rank below strong lexical hits

// Text an item is embedded/scored over.
const itemSearchText = (i) => [i.title, i.topic, (i.tags || []).join(' '), i.body].join(' ');

// Project-local set of ids that some other item declares it supersedes.
const supersededSet = (pool) => {
  const s = new Set();
  for (const i of pool) for (const id of i.supersedes || []) s.add(id);
  return s;
};

// Symmetric adjacency from `related` edges (only edges that resolve in-pool).
function buildAdjacency(pool) {
  const ids = new Set(pool.map((i) => i.id));
  const adj = new Map();
  const link = (a, b) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(b); };
  for (const i of pool) for (const r of i.related || []) if (ids.has(r)) { link(i.id, r); link(r, i.id); }
  return adj;
}

const firstSentences = (text, n = 2) =>
  ((text || '').split(/(?<=[.!?])\s+/).slice(0, n).join(' ')).trim();

// Smallest faithful short form: prefer an authored `brief`, else trim to the
// first two sentences. Returns null if nothing is genuinely shorter than body.
function compressedForm(item) {
  const body = item.body || '';
  if (item.brief && item.brief.length < body.length) return item.brief;
  const st = firstSentences(body, 2);
  return st && st.length < body.length ? st : null;
}

// Vector recall-expansion. Rather than re-rank with RRF (which disturbs the
// proven lexical+structural ranking and, under a tight budget, can crowd out a
// graph-boosted must-have), we keep every lexical score as-is and only ADD items
// that lexical entirely missed (score 0) but the vector retriever finds (cosine ≥
// VEC_MIN). Each recalled item is scored BELOW strong lexical hits (so it can't
// displace them) but above zero (so it can be packed) — higher cosine ranks
// higher. This makes embeddings a pure recall gain: it recovers morphological /
// subword misses without regressing anything the lexical path already got right.
function addVectorRecall(pool, lexById, task, embed) {
  const tvec = embed(task);
  const scale = Math.max(0, ...lexById.values()) || 1; // anchor recalled scores to the lexical range
  const merged = new Map(lexById);
  const recalled = pool
    .filter((i) => (lexById.get(i.id) || 0) === 0) // only what lexical missed
    .map((i) => ({ id: i.id, sim: cosine(tvec, embed(itemSearchText(i))) }))
    .filter((e) => e.sim >= VEC_MIN)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, VEC_K);
  for (const { id, sim } of recalled) merged.set(id, scale * VEC_RECALL_WEIGHT * sim);
  return merged;
}

// ---------------------------------------------------------------------------
// pack() — the killer function. Given a task, a project, and a token budget,
// return the minimum useful bundle: warnings that must always travel, then the
// highest-value items greedily packed (compressing to fit) until budget is spent.
// ---------------------------------------------------------------------------
export function pack({ library, task, project, token_budget = 2500, goal, embed = null }) {
  const taskTerms = tokenize(task).filter((t) => !STOP.has(t));
  const pool = library.filter((i) => i.project === project);

  // Base relevance. By default this is the deterministic lexical/structural score
  // (no network, no model — the frozen fast-path). When an `embed` provider is
  // supplied, we ALSO retrieve by vector similarity and fuse the two candidate
  // lists with Reciprocal Rank Fusion (RRF) — so a must-have that exact-token
  // matching misses (morphological variants, shared subwords) is still found.
  const lexById = new Map(pool.map((i) => [i.id, score(i, taskTerms)]));
  const baseById = embed ? addVectorRecall(pool, lexById, task, embed) : lexById;
  // Base lexical/structural score, then a graph-relatedness boost: an item that
  // is `related` to a strong match gets lifted — so a load-bearing fact that is
  // lexically weak but topically adjacent can still earn a place (recall).
  const maxBase = Math.max(0, ...baseById.values());
  const anchorCut = maxBase * ANCHOR_FRACTION;
  const adj = buildAdjacency(pool);
  const boosted = (i) => {
    let s = baseById.get(i.id);
    const isAnchor = s >= anchorCut && s > 0;
    if (!isAnchor && maxBase > 0) {
      for (const nb of adj.get(i.id) || []) {
        const ns = baseById.get(nb) || 0;
        if (ns >= anchorCut && ns > 0) { s += RELATED_BONUS * maxBase; break; }
      }
    }
    return s;
  };

  const scored = pool
    .map((i) => ({ item: i, s: boosted(i) }))
    .sort((a, b) => b.s - a.s);

  const superseded = supersededSet(pool);
  const fullCost = (i) => estimateTokens(i.body) + 12; // +heading overhead
  const briefOf = (i) => (i.always ? null : compressedForm(i)); // do-not-break = verbatim
  const briefCost = (i) => { const b = briefOf(i); return b ? estimateTokens(b) + 12 : null; };

  // Eligible = always items (kept regardless of score) plus relevant items that
  // are not zero-signal, stale, or SUPERSEDED (archive — expand() only).
  const eligible = scored.filter(
    (e) => e.item.always || (e.s > 0 && !e.item.stale && !superseded.has(e.item.id))
  );

  const chosen = []; // { item, body, compressed, cost }
  let used = 0;
  const add = (item, body, compressed, cost) => { chosen.push({ item, body, compressed, cost }); used += cost; };

  // 1) Always carry the "do-not-break" items, verbatim and first (the always-cap
  //    lint guarantees they fit well under any real budget).
  for (const e of eligible) if (e.item.always) {
    const c = fullCost(e.item);
    if (used + c <= token_budget) add(e.item, e.item.body, false, c);
  }
  // 2) Coverage pass: add each remaining item in its SMALLEST faithful form
  //    (compressed when a brief exists), maximizing how much the pack covers.
  for (const e of eligible) {
    if (e.item.always) continue;
    const bc = briefCost(e.item);
    const compress = bc != null;
    const cost = compress ? bc : fullCost(e.item);
    if (used + cost <= token_budget) add(e.item, compress ? briefOf(e.item) : e.item.body, compress, cost);
  }
  // 3) Detail pass: spend leftover budget upgrading compressed items back to full,
  //    in score order — best fidelity we can afford without dropping coverage. At
  //    a roomy budget everything upgrades, so the pack is identical to full-text.
  for (const c of chosen) {
    if (!c.compressed) continue;
    const delta = fullCost(c.item) - c.cost;
    if (used + delta <= token_budget) { c.body = c.item.body; c.compressed = false; c.cost += delta; used += delta; }
  }

  const items = chosen.map((c) => (c.compressed ? { ...c.item, body: c.body, compressed: true } : c.item));
  return assemble({ task, project, goal, items, used, budget: token_budget });
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
    `\n\n[pack: ${used}/${budget} tokens · ${items.length} items` +
    `${items.filter((i) => i.compressed).length ? ` · ${items.filter((i) => i.compressed).length} compressed` : ''}` +
    ` · expand("topic") for more]`;

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
export const slugify = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'finding';

// Normalize body for dedup: an agent re-learning the same fact must NOT spawn a
// near-identical file every session. Reused by ingestion to dedup extracted
// candidates against the existing library.
export const normalizeBody = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Tiny frontmatter serializer — emits exactly the subset the parser/validator
// understand (scalars, inline string arrays, booleans). Order is cosmetic.
export function serialize(meta, body) {
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
    opt('confidence', meta.confidence),
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
