// MCP smoke test: spawn the real stdio server as a subprocess, connect a real
// MCP client, and exercise the product surface end-to-end — listTools, a pack
// call against the bundled library, and a remember()→dedup round-trip against a
// throwaway library. This is the "does the wire actually work" gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = dirname(fileURLToPath(import.meta.url));
const SERVER = join(here, '..', 'mcp', 'server.js');

const connect = async (env) => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: { ...process.env, ...env },
  });
  const client = new Client({ name: 'rrsrch-smoke', version: '0' });
  await client.connect(transport);
  return client;
};

test('server exposes the five product tools', async () => {
  const client = await connect({ RRSRCH_PROJECT: 'Bouncr' });
  try {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, ['expand', 'pack', 'related', 'remember', 'sources']);
  } finally {
    await client.close();
  }
});

test('pack returns a budgeted context pack for a real task', async () => {
  const client = await connect({ RRSRCH_PROJECT: 'Bouncr' });
  try {
    const res = await client.callTool({
      name: 'pack',
      arguments: { task: 'Implement merchant Stripe Connect onboarding', budget: 2500 },
    });
    const out = res.content[0].text;
    assert.match(out, /Context Pack: Bouncr/);
    assert.match(out, /\[pack: \d+\/2500 tokens/); // token accounting present
  } finally {
    await client.close();
  }
});

test('remember writes via MCP, then dedupes on a second identical call', async () => {
  const root = mkdtempSync(join(tmpdir(), 'rrsrch-mcp-'));
  const client = await connect({ RRSRCH_LIBRARY: root, RRSRCH_PROJECT: 'Demo' });
  try {
    const args = { title: 'CI uses Node 20', body: 'The CI matrix pins Node 20; do not assume 22.' };
    const first = (await client.callTool({ name: 'remember', arguments: args })).content[0].text;
    const second = (await client.callTool({ name: 'remember', arguments: args })).content[0].text;
    assert.match(first, /Saved finding/);
    assert.match(second, /Already known/);
  } finally {
    await client.close();
    rmSync(root, { recursive: true, force: true });
  }
});
