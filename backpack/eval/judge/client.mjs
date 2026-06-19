// Anthropic client for the judged kill-switch experiment. This is the ONLY part
// of the backpack that needs the network + an API key — the deterministic core
// (engine, validator, id-overlap eval) runs with zero dependencies.
import Anthropic from '@anthropic-ai/sdk';

export function makeClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set.\n' +
      'The judged experiment (task-success) needs an Anthropic API key:\n' +
      '  ANTHROPIC_API_KEY=sk-ant-... npm run experiment\n'
    );
  }
  return new Anthropic();
}

// Sonnet 4.6 is the default for BOTH solve and judge: it still accepts
// `temperature` (Opus 4.8 / Fable 5 reject it with a 400), so we can pin
// temperature: 0 for a near-deterministic eval. Override via env if desired.
export const SOLVER_MODEL = process.env.BACKPACK_SOLVER_MODEL || 'claude-sonnet-4-6';
export const JUDGE_MODEL = process.env.BACKPACK_JUDGE_MODEL || 'claude-sonnet-4-6';
