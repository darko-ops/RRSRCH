#!/usr/bin/env node
// RRSRCH MCP server — the product surface. An agent (Claude Code / Cursor /
// Codex / any MCP client) calls these tools mid-task to get the SMALLEST useful
// context pack for the work ahead, and to save durable findings back.
//
// Tools: pack · expand · sources · related · remember
//
// The library lives on disk as markdown+frontmatter. Point the server at YOUR
// repo's library with RRSRCH_LIBRARY=/path/to/library; it defaults to the
// bundled demo library beside this package. We reload the library on every call
// so packs reflect the latest files (and write-back) without a watcher.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { loadLibrary, pack, expand, sources, related, remember } from '../lib/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const LIBRARY_ROOT = resolve(process.env.RRSRCH_LIBRARY || join(here, '..', 'library'));
const DEFAULT_PROJECT = process.env.RRSRCH_PROJECT || undefined;

// Reload per call so edits + remember() writes are always visible. Cheap at v0
// scale (markdown read); swap for a watcher/SQLite when the library is large.
const load = () => loadLibrary(LIBRARY_ROOT);

const text = (s) => ({ content: [{ type: 'text', text: s }] });
const asLines = (items) =>
  items.length
    ? items.map((i) => `• [${i.type}] ${i.title} (id: ${i.id})\n  ${i.body.split('\n')[0]}`).join('\n')
    : '(nothing found — try a broader query, or remember() it once you learn it)';

const projectArg = z
  .string()
  .optional()
  .describe('Project scope (e.g. "Bouncr"). Defaults to RRSRCH_PROJECT if set.');
const resolveProject = (p) => {
  const project = p || DEFAULT_PROJECT;
  if (!project) throw new Error('No project given and RRSRCH_PROJECT is not set.');
  return project;
};

const server = new McpServer({ name: 'rrsrch', version: '0.1.0' });

server.registerTool(
  'pack',
  {
    title: 'Build a context pack',
    description:
      'Return the minimum useful context for a task under a token budget: ' +
      'decisions, constraints, do-not-break warnings, likely files, and sources — ' +
      'plus a map to expand() for more. Call this BEFORE researching a task from scratch.',
    inputSchema: {
      task: z.string().describe('The task you are about to do, in a sentence.'),
      project: projectArg,
      budget: z.number().int().positive().optional().describe('Token budget (default 2500).'),
    },
  },
  async ({ task, project, budget }) => {
    const result = pack({
      library: load(),
      task,
      project: resolveProject(project),
      token_budget: budget ?? 2500,
    });
    return text(result.text);
  }
);

const discloseTool = (name, fn, desc) =>
  server.registerTool(
    name,
    {
      title: name,
      description: desc,
      inputSchema: {
        query: z.string().describe('What you want more detail on.'),
        project: projectArg,
      },
    },
    async ({ query, project }) =>
      text(asLines(fn({ library: load(), project: resolveProject(project), query })))
  );

discloseTool('expand', expand, 'Progressive disclosure: pull more library items matching a query (beyond what the pack carried).');
discloseTool('sources', sources, 'Return source-backed items (with provenance) matching a query.');
discloseTool('related', related, 'Return items related to a query — the neighborhood around a topic.');

server.registerTool(
  'remember',
  {
    title: 'Save a finding',
    description:
      'Write a durable finding back into the library so the next task inherits it. ' +
      'Plain capture only (no inference). Deduplicates against identical bodies. ' +
      'Use for facts you had to discover that will matter again.',
    inputSchema: {
      title: z.string().describe('Short title for the finding.'),
      body: z.string().describe('The finding itself, self-contained.'),
      project: projectArg,
      topic: z.string().optional().describe('Space-separated keywords to aid retrieval.'),
      tags: z.array(z.string()).optional(),
      files: z.array(z.string()).optional().describe('Related file paths.'),
      source: z.string().optional().describe('Where this came from (URL/doc), if any.'),
      importance: z.number().int().min(1).max(5).optional().describe('1..5 (default 3).'),
    },
  },
  async ({ title, body, project, topic, tags, files, source, importance }) => {
    const r = remember({
      libraryRoot: LIBRARY_ROOT,
      project: resolveProject(project),
      title,
      body,
      topic,
      tags,
      files,
      source,
      importance,
    });
    return text(
      r.created
        ? `Saved finding "${r.item.title}" (id: ${r.item.id}) to ${r.path}.`
        : `Already known — matched existing item "${r.item.title}" (id: ${r.item.id}); nothing written.`
    );
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`rrsrch MCP server up · library: ${LIBRARY_ROOT}${DEFAULT_PROJECT ? ` · project: ${DEFAULT_PROJECT}` : ''}`);
