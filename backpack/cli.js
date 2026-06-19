#!/usr/bin/env node
// RRSRCH CLI — drive the backpack from the terminal.
//
//   node cli.js pack   "<task>" --project Bouncr --budget 2500
//   node cli.js expand "<query>" --project Bouncr
//   node cli.js sources "<query>" --project Bouncr
//   node cli.js related "<query>" --project Bouncr
//   node cli.js remember "<finding body>" --project Bouncr --title "..." [--topic ..] [--importance 4]
//   node cli.js extract "<repoPath>" --project Bouncr     # scan a repo into the review queue
//   node cli.js review  --project Bouncr                  # list queued candidates
//   node cli.js accept  "<id>" --project Bouncr           # move a candidate into the library
//   node cli.js reject  "<id>" --project Bouncr           # discard a candidate
//
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { loadLibrary, pack, expand, sources, related, remember } from './lib/engine.js';
import { defaultProvider } from './lib/embed.js';
import { extractFromRepo, stageCandidates, listReview, acceptCandidate, rejectCandidate } from './lib/ingest.js';

const here = dirname(fileURLToPath(import.meta.url));
const LIBRARY_ROOT = resolve(process.env.RRSRCH_LIBRARY || join(here, 'library'));
const REVIEW_ROOT = resolve(process.env.RRSRCH_REVIEW || join(here, 'review'));
const LIBRARY = loadLibrary(LIBRARY_ROOT);
// Opt-in keyless semantic recall. Off by default keeps packs deterministic.
const EMBED = process.env.RRSRCH_EMBED ? defaultProvider.embed : null;

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
    console.log(pack({ library: LIBRARY, task: query, project, token_budget: budget, embed: EMBED }).text);
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
  case 'remember': {
    const tags = flag('tags', '');
    const r = remember({
      libraryRoot: LIBRARY_ROOT,
      project,
      title: flag('title', query.slice(0, 60)),
      body: query,
      topic: flag('topic', ''),
      tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      source: flag('source', ''),
      importance: Number(flag('importance', 3)),
    });
    console.log(r.created ? `saved: ${r.path}` : `already known: ${r.item.id} (nothing written)`);
    break;
  }
  case 'extract': {
    const { candidates, truncated } = extractFromRepo(resolve(query), project);
    const { staged, skipped } = stageCandidates({ reviewRoot: REVIEW_ROOT, libraryRoot: LIBRARY_ROOT, project, candidates });
    console.log(`extracted ${candidates.length} candidate(s) from ${query} → staged ${staged}, skipped ${skipped} dup(s).`);
    if (truncated) console.log(`(capped at the extractor limit — more candidates exist; re-run after accepting/rejecting.)`);
    console.log(`review them: node cli.js review --project ${project}`);
    break;
  }
  case 'review': {
    const items = listReview(REVIEW_ROOT, project);
    if (!items.length) { console.log(`review queue empty for ${project}.`); break; }
    console.log(`${items.length} queued candidate(s) for ${project} (provenance: extracted, confidence ${items[0].confidence ?? 0.3}):`);
    for (const i of items) console.log(`• ${i.id}  [${i.type}] ${i.title}\n    ${i.body.split('\n')[0]}`);
    console.log(`accept: node cli.js accept "<id>" --project ${project}   ·   reject: node cli.js reject "<id>" --project ${project}`);
    break;
  }
  case 'accept': {
    const r = acceptCandidate({ reviewRoot: REVIEW_ROOT, libraryRoot: LIBRARY_ROOT, project, id: query });
    console.log(`accepted ${query} → ${r.path}`);
    break;
  }
  case 'reject': {
    rejectCandidate({ reviewRoot: REVIEW_ROOT, project, id: query });
    console.log(`rejected ${query} (removed from review queue)`);
    break;
  }
  default:
    console.log('usage: cli.js <pack|expand|sources|related|remember|extract|review|accept|reject> "<text>" --project <P> [--budget N] [--title ..] [--topic ..] [--tags a,b] [--importance N]');
}
