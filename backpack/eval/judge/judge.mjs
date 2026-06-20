// The judge: scores a solution against a fixed rubric, blind to which arm produced
// it. Uses structured outputs (json_schema) so the verdict is machine-readable and
// the model can't wander off-format. temperature: 0 + thinking disabled for the most
// reproducible grading Sonnet 4.6 allows (note: temp 0 is not bit-for-bit identical).
import { JUDGE_MODEL } from './client.mjs';

const SYSTEM = `You are a strict, impartial grader of engineering implementation plans.
You are given a TASK, a candidate SOLUTION (a plan), and a RUBRIC of independent criteria.
For each criterion, decide whether the solution satisfies it: "met", "partial", or "missing".
Grade ONLY what the solution actually states. Do not give credit for things a competent engineer
"would obviously do" if the plan does not say them. If a criterion is not clearly addressed, it is
"missing". Be conservative and consistent.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          verdict: { type: 'string', enum: ['met', 'partial', 'missing'] },
          reason: { type: 'string' },
        },
        required: ['id', 'verdict', 'reason'],
      },
    },
  },
  required: ['criteria'],
};

const POINTS = { met: 1, partial: 0.5, missing: 0 };

export async function judge(client, task, solution, rubric) {
  const rubricText = rubric.map((r) => `(${r.id}) ${r.criterion}`).join('\n');
  const res = await client.chat.completions.create({
    model: JUDGE_MODEL,
    max_tokens: 1500,
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `TASK: ${task}\n\nSOLUTION:\n${solution}\n\nRUBRIC (return a verdict for EVERY id):\n${rubricText}`,
      },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'rubric_verdict', strict: true, schema: SCHEMA } },
  });

  const parsed = JSON.parse(res.choices[0]?.message?.content || '{"criteria":[]}');
  const byId = new Map(parsed.criteria.map((c) => [c.id, c]));
  let score = 0;
  for (const r of rubric) score += POINTS[byId.get(r.id)?.verdict ?? 'missing'] ?? 0;
  return { score: score / rubric.length, criteria: rubric.map((r) => byId.get(r.id) || { id: r.id, verdict: 'missing', reason: 'not returned' }) };
}
