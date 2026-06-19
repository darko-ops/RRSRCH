// RRSRCH — telemetry. The Phase 4 measurement loop (ROADMAP §7): record what the
// agent actually asked for so "are packs getting smarter?" is answerable. The
// signal that matters is `expand` — an expand call means the pack was MISSING
// something, so expansions trending DOWN over time is the exit-gate evidence that
// the index is improving.
//
// Opt-in and side-effect-free by default: with no sink configured it is a no-op,
// so the deterministic core and the tests stay clean. Set RRSRCH_TELEMETRY to a
// file path to capture a JSONL event stream.
import { appendFileSync } from 'node:fs';

let sink = process.env.RRSRCH_TELEMETRY || null;
export const setSink = (path) => { sink = path || null; };

export function record(event) {
  if (!sink) return;
  try {
    appendFileSync(sink, JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n');
  } catch { /* telemetry must never break a pack */ }
}
