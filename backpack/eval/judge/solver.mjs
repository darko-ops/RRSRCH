// The solver: a stand-in for "the agent that consumes the pack". It gets ONLY
// the task + one arm's context, and must produce an implementation plan. Whether
// the plan honors the load-bearing project facts depends on whether the right
// context was in front of it — which is exactly what the experiment measures.
import { SOLVER_MODEL } from './client.mjs';

const SYSTEM = `You are a senior engineer implementing a change on the Helios platform.
You are given a CONTEXT PACK with Helios's project-specific decisions, constraints, and warnings.
Treat the pack as the single source of truth for Helios conventions: follow what it says, do not
invent project facts that aren't in it, and do not assume an industry-default approach when the pack
specifies a Helios-specific one. If the pack does not cover something the task needs, briefly note
the assumption you're making.
Output a concrete implementation plan as 8-15 short bullet points covering: the approach, the
specific Helios decisions/constraints you will follow, and the safeguards you will honor. Be specific
(name the rules you're applying); do not pad.`;

export async function solve(client, task, packText) {
  const msg = await client.messages.create({
    model: SOLVER_MODEL,
    max_tokens: 1500,
    temperature: 0,
    thinking: { type: 'disabled' },
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `TASK: ${task}\n\n=== CONTEXT PACK ===\n${packText}\n=== END CONTEXT PACK ===\n\nWrite the implementation plan now.`,
    }],
  });
  return msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}
