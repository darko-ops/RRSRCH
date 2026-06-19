#!/usr/bin/env node
// RRSRCH — HTTP API. The hosting seam: the same engine the CLI and MCP server use,
// exposed over plain JSON for remote/team use. Zero dependencies (node:http), so
// the core stays installable by a stranger.
//
// This is deliberately the THIN edge of Phase 4. Auth, multi-tenant isolation, and
// the Postgres/pgvector store are intentionally NOT here yet — they're premature
// until solo users love Phases 1–3 (ROADMAP §7 risk). The library is still the
// filesystem; `loadLibrary` is reloaded per request so edits + write-back show up.
//
//   RRSRCH_LIBRARY=/path RRSRCH_PROJECT=Acme node http/server.js   # :8787
//   curl -s localhost:8787/pack -d '{"task":"...","budget":2500}'
import { createServer as httpCreateServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { loadLibrary, pack, expand, sources, related, remember } from '../lib/engine.js';
import { defaultProvider } from '../lib/embed.js';
import { record } from '../lib/telemetry.js';

const here = dirname(fileURLToPath(import.meta.url));

export function createServer(opts = {}) {
  const libraryRoot = resolve(opts.libraryRoot || process.env.RRSRCH_LIBRARY || join(here, '..', 'library'));
  const defaultProject = opts.project || process.env.RRSRCH_PROJECT || undefined;
  const embed = (opts.embed ?? process.env.RRSRCH_EMBED) ? defaultProvider.embed : null;
  const load = () => loadLibrary(libraryRoot);
  const resolveProject = (p) => {
    const project = p || defaultProject;
    if (!project) throw new Error('no project given and RRSRCH_PROJECT is not set');
    return project;
  };

  const readBody = (req) => new Promise((res) => {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', () => { try { res(b ? JSON.parse(b) : {}); } catch { res({}); } });
  });

  const routes = {
    'POST /pack': (a) => {
      const r = pack({ library: load(), task: a.task || '', project: resolveProject(a.project), token_budget: a.budget ?? 2500, embed });
      record({ kind: 'pack', project: resolveProject(a.project), task: a.task, tokens: r.used, items: r.items.length, budget: a.budget ?? 2500 });
      return { text: r.text, used: r.used, budget: r.budget, items: r.items.map((i) => i.id) };
    },
    'POST /expand': (a) => {
      const items = expand({ library: load(), project: resolveProject(a.project), query: a.query || '' });
      record({ kind: 'expand', project: resolveProject(a.project), query: a.query, returned: items.length }); // "pack missed something"
      return { items };
    },
    'POST /sources': (a) => ({ items: sources({ library: load(), project: resolveProject(a.project), query: a.query || '' }) }),
    'POST /related': (a) => ({ items: related({ library: load(), project: resolveProject(a.project), query: a.query || '' }) }),
    'POST /remember': (a) => {
      const r = remember({ libraryRoot, project: resolveProject(a.project), title: a.title, body: a.body, topic: a.topic, tags: a.tags, files: a.files, source: a.source, importance: a.importance });
      return { created: r.created, id: r.item.id, path: r.path };
    },
  };

  return httpCreateServer(async (req, res) => {
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const url = (req.url || '/').split('?')[0];
    if (req.method === 'GET' && url === '/health') return send(200, { ok: true, library: libraryRoot, embeddings: !!embed });
    const handler = routes[`${req.method} ${url}`];
    if (!handler) return send(404, { error: `no route ${req.method} ${url}` });
    try {
      return send(200, handler(await readBody(req)));
    } catch (e) {
      return send(400, { error: String(e.message || e) });
    }
  });
}

// Run directly → listen.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const port = Number(process.env.RRSRCH_PORT || 8787);
  createServer().listen(port, () => console.error(`rrsrch HTTP API on :${port}`));
}
