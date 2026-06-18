// Eval metrics — all computed from the set of item ids a pack contains, plus its
// token cost. Deterministic, no LLM. The split is deliberate (ROADMAP §6):
//   HARD GATES (guarantees): mandatory-coverage, must-not leakage.
//   REPORTED (quality): recall@budget, noise, token-efficiency.
// task-success + expand-precision need an agent loop — stubbed here for Phase 1.

const inter = (a, setB) => a.filter((x) => setB.has(x));

// 100% of the project's `always` items must be present. Hard gate.
export function mandatoryCoverage(packedIds, alwaysIds) {
  const present = new Set(packedIds);
  const missing = alwaysIds.filter((id) => !present.has(id));
  return { ok: missing.length === 0, ratio: alwaysIds.length ? (alwaysIds.length - missing.length) / alwaysIds.length : 1, missing };
}

// Fraction of must-have items that made the pack.
export function recallAtBudget(packedIds, mustHave) {
  if (!mustHave.length) return { ratio: 1, covered: 0, total: 0, missing: [] };
  const present = new Set(packedIds);
  const missing = mustHave.filter((id) => !present.has(id));
  const covered = mustHave.length - missing.length;
  return { ratio: covered / mustHave.length, covered, total: mustHave.length, missing };
}

// Fraction of packed items that are in neither must nor nice sets (pure noise).
export function noiseRatio(packedIds, mustHave, niceToHave) {
  if (!packedIds.length) return { ratio: 0, noise: [] };
  const wanted = new Set([...mustHave, ...niceToHave]);
  const noise = packedIds.filter((id) => !wanted.has(id));
  return { ratio: noise.length / packedIds.length, noise };
}

// Any forbidden item present → leak. Hard gate.
export function mustNotLeakage(packedIds, mustNot) {
  const present = new Set(packedIds);
  const leaked = mustNot.filter((id) => present.has(id));
  return { ok: leaked.length === 0, leaked };
}

// Must-have coverage per 1k tokens — the product promise: coverage you can afford.
export function tokenEfficiency(recall, tokens) {
  const per1k = tokens > 0 ? recall.covered / (tokens / 1000) : 0;
  return { per1k, covered: recall.covered, tokens };
}

// Phase 1 — need an agent loop + LLM judge. Shape exists so callers can wire it.
export function taskSuccess() { return { score: null, todo: 'Phase 1: run agent on the pack, LLM-judge completion' }; }
export function expandPrecision() { return { score: null, todo: 'Phase 1: was each expand() call load-bearing for success?' }; }

export function evaluate({ packedIds, tokens, alwaysIds, must_have, nice_to_have, must_not_include }) {
  const recall = recallAtBudget(packedIds, must_have);
  return {
    coverage: mandatoryCoverage(packedIds, alwaysIds),
    recall,
    noise: noiseRatio(packedIds, must_have, nice_to_have),
    leakage: mustNotLeakage(packedIds, must_not_include),
    efficiency: tokenEfficiency(recall, tokens),
    items: packedIds.length,
    tokens,
  };
}
