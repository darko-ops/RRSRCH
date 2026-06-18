#!/usr/bin/env node
// RRSRCH CLI — drive the backpack from the terminal.
//
//   node cli.js pack   "<task>" --project Bouncr --budget 2500
//   node cli.js expand "<query>" --project Bouncr
//   node cli.js sources "<query>" --project Bouncr
//   node cli.js related "<query>" --project Bouncr
//
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadLibrary, pack, expand, sources, related } from './lib/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const LIBRARY = loadLibrary(join(here, 'library'));

const argv = process.argv.slice(2);
const cmd = argv[0];
const query = argv[1] || '';
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const project = flag('project', 'Bouncr');
const budget = Number(flag('budget', 2500));

const showList = (items) =>
  console.log(items.map((i) => `• [${i.type}] ${i.title}\n  ${i.body.split('\n')[0]}`).join('\n'));

switch (cmd) {
  case 'pack':
    console.log(pack({ library: LIBRARY, task: query, project, token_budget: budget }).text);
    break;
  case 'expand':
    showList(expand({ library: LIBRARY, project, query }));
    break;
  case 'sources':
    showList(sources({ library: LIBRARY, project, query }));
    break;
  case 'related':
    showList(related({ library: LIBRARY, project, query }));
    break;
  default:
    console.log('usage: cli.js <pack|expand|sources|related> "<text>" --project <P> --budget <N>');
}
