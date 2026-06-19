#!/usr/bin/env node
// RRSRCH library linter. The schema (item.schema.json) is the source of truth:
// we read its required fields / enums / bounds and apply them, then enforce the
// structural disciplines that ARE the product's safety guarantees:
//   - ids unique within a project
//   - supersedes/related edges resolve (no dangling graph edges)
//   - the ALWAYS-CAP: Σ tokens of `always` items per project ≤ Brief ceiling.
//     Breaching it is an error + a library-health lint — "too many do-not-break
//     items" — never a silent overflow (ROADMAP §2.4 / §5).
//
// Usage: node schema/validate.mjs [libraryDir]   (default: ../library)
// Exit non-zero on any violation, so CI gates on it.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { estimateTokens } from '../lib/engine.js';
import { hasSecret } from '../lib/redact.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA = JSON.parse(readFileSync(join(HERE, 'item.schema.json'), 'utf8'));

// Brief-tier ceiling (tokens). Reserved (`always`) items per project may not
// exceed this — keep the same estimator the engine packs with.
const BRIEF_CEILING = 400;

// --- frontmatter parse (strict: no defaulting, so missing fields are caught) ---
function parseFile(path) {
  const raw = readFileSync(path, 'utf8');
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { meta: null, body: raw.trim() };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let val = kv[2].trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (val === 'true' || val === 'false') {
      val = val === 'true';
    } else {
      val = val.replace(/^["']|["']$/g, '');
    }
    meta[kv[1]] = val;
  }
  return { meta, body: m[2].trim() };
}

// --- generic schema checks (the subset of JSON Schema this contract uses) ---
function checkField(id, key, val, spec, errors) {
  const where = `${id}: field '${key}'`;
  if (spec.enum && !spec.enum.includes(val)) {
    errors.push(`${where} = '${val}' not in [${spec.enum.join(', ')}]`);
    return;
  }
  switch (spec.type) {
    case 'string':
      if (typeof val !== 'string') errors.push(`${where} must be a string`);
      else if (spec.minLength && val.length < spec.minLength) errors.push(`${where} must be non-empty`);
      else if (spec.pattern && !new RegExp(spec.pattern).test(val)) errors.push(`${where} must match ${spec.pattern}`);
      break;
    case 'integer':
    case 'number': {
      const n = typeof val === 'number' ? val : (/^-?\d+(\.\d+)?$/.test(val) ? Number(val) : NaN);
      if (Number.isNaN(n)) { errors.push(`${where} must be a ${spec.type}`); break; }
      if (spec.type === 'integer' && !Number.isInteger(n)) errors.push(`${where} must be an integer`);
      if (spec.minimum != null && n < spec.minimum) errors.push(`${where} must be ≥ ${spec.minimum}`);
      if (spec.maximum != null && n > spec.maximum) errors.push(`${where} must be ≤ ${spec.maximum}`);
      break;
    }
    case 'boolean':
      if (typeof val !== 'boolean') errors.push(`${where} must be true/false`);
      break;
    case 'array':
      if (!Array.isArray(val)) errors.push(`${where} must be an array`);
      else if (spec.items?.type === 'string' && val.some((x) => typeof x !== 'string'))
        errors.push(`${where} must be an array of strings`);
      break;
  }
}

function validateItem(item, errors) {
  const { meta, body, path } = item;
  if (!meta) { errors.push(`${path}: no YAML frontmatter`); return; }
  const id = meta.id || path;
  for (const r of SCHEMA.required) if (!(r in meta)) errors.push(`${id}: missing required field '${r}'`);
  if (SCHEMA.additionalProperties === false)
    for (const k of Object.keys(meta)) if (!(k in SCHEMA.properties)) errors.push(`${id}: unknown field '${k}'`);
  for (const [k, v] of Object.entries(meta)) if (SCHEMA.properties[k]) checkField(id, k, v, SCHEMA.properties[k], errors);
  if (!body || !body.trim()) errors.push(`${id}: empty body`);
}

// --- load ---
function loadRaw(root) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (extname(p) === '.md') out.push({ ...parseFile(p), path: p });
    }
  };
  walk(root);
  return out;
}

// --- run ---
const libDir = resolve(process.argv[2] || join(HERE, '..', 'library'));
const items = loadRaw(libDir);
const errors = [];

for (const it of items) validateItem(it, errors);

// id uniqueness within project
const seen = new Map();
for (const { meta, path } of items) {
  if (!meta?.id || !meta?.project) continue;
  const key = `${meta.project}::${meta.id}`;
  if (seen.has(key)) errors.push(`duplicate id '${meta.id}' in project '${meta.project}' (${path} and ${seen.get(key)})`);
  else seen.set(key, path);
}

// edge resolution (supersedes/related) within a project
const idsByProject = new Map();
for (const { meta } of items) {
  if (!meta?.id || !meta?.project) continue;
  if (!idsByProject.has(meta.project)) idsByProject.set(meta.project, new Set());
  idsByProject.get(meta.project).add(meta.id);
}
for (const { meta } of items) {
  if (!meta?.project) continue;
  const known = idsByProject.get(meta.project) || new Set();
  for (const edge of ['supersedes', 'related']) {
    const refs = Array.isArray(meta?.[edge]) ? meta[edge] : meta?.[edge] ? [meta[edge]] : [];
    for (const ref of refs) if (!known.has(ref)) errors.push(`${meta.id}: ${edge} -> '${ref}' does not resolve in project '${meta.project}'`);
  }
}

// always-cap per project
const alwaysTokens = new Map();
const staleCount = items.filter((i) => i.meta?.stale === true).length;
for (const { meta, body } of items) {
  if (meta?.always === true) {
    const t = estimateTokens(body) + 12; // same overhead the packer reserves
    alwaysTokens.set(meta.project, (alwaysTokens.get(meta.project) || 0) + t);
  }
}
for (const [project, toks] of alwaysTokens) {
  if (toks > BRIEF_CEILING)
    errors.push(`always-cap breached in project '${project}': ${toks} tok of do-not-break items > Brief ceiling ${BRIEF_CEILING}. Too many things marked always — demote some.`);
}

// report
if (errors.length) {
  console.error(`✗ library lint FAILED (${errors.length} issue${errors.length > 1 ? 's' : ''}) in ${libDir}`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

// Stored-secret WARNING (non-fatal): packs redact secret values on the way out,
// but a raw secret should never have been committed to the library in the first
// place. Flag it so the author can remove it; don't fail the build on a heuristic.
const secretWarnings = [];
for (const { meta, body, path } of items) {
  if (hasSecret(body) || hasSecret(meta?.title || '')) secretWarnings.push(`${meta?.id || path}: looks like it contains a raw secret value — remove it (packs redact, but don't store secrets)`);
}

const projects = [...idsByProject.keys()];
console.log(`✓ library OK — ${items.length} items across ${projects.length} project(s): ${projects.join(', ')}`);
if (secretWarnings.length) {
  console.log(`  ⚠ ${secretWarnings.length} stored-secret warning(s):`);
  for (const w of secretWarnings) console.log('    - ' + w);
}
console.log(`  stale (archive-only): ${staleCount}`);
for (const [project, toks] of alwaysTokens) console.log(`  always-cap ${project}: ${toks}/${BRIEF_CEILING} tok`);
