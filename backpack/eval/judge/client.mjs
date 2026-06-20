// OpenAI client for the judged kill-switch experiment. This is the ONLY part of
// the backpack that needs the network + an API key — the deterministic core
// (engine, validator, id-overlap eval) runs with zero dependencies.
//
// (The harness was ported from Anthropic to OpenAI to run on the key that's
// available; the solver/judge structure and rubric are unchanged. Swap the models
// or re-point at another SDK without touching run-experiment.mjs.)
import OpenAI from 'openai';

export function makeClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY is not set.\n' +
      'The judged experiment (task-success) needs an OpenAI API key:\n' +
      '  OPENAI_API_KEY=sk-... npm run experiment\n' +
      '  (or put it in a gitignored .env — `npm run experiment` auto-loads ./.env and ../.env)\n'
    );
  }
  return new OpenAI();
}

// Solver can be cheaper than the judge (it only writes a plan; the judge must
// grade strictly). Both pinned to temperature 0 for the most reproducible run.
export const SOLVER_MODEL = process.env.BACKPACK_SOLVER_MODEL || 'gpt-4o-mini';
export const JUDGE_MODEL = process.env.BACKPACK_JUDGE_MODEL || 'gpt-4o';
