// RRSRCH — secret redaction. Phase 4's headline guarantee, in the OPEN core
// because it protects every user: a context pack must NEVER carry a secret value
// into an agent's prompt. This is the productized form of the house rule — "the
// LLM never touches the price / the secret" — and like the always-cap it is a
// deterministic guarantee, not best-effort.
//
// Detection is PATTERN-based (precise), not entropy-based (noisy): known provider
// key shapes, PEM private keys, JWTs, credentials embedded in URLs, and explicit
// `secret = value` assignments. Each match is replaced with a typed placeholder
// so the agent still sees that a secret EXISTS (and its kind) without its value.

// [label, regex, replacer]. Order matters: structural matches (PEM, URL) first.
const RULES = [
  ['private-key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z]+ )?PRIVATE KEY-----/g, () => '‹redacted:private-key›'],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, () => '‹redacted:jwt›'],
  // credentials in a connection string / URL — keep scheme + user, drop password.
  ['url-credentials', /\b([a-z][a-z0-9+.\-]*:\/\/[^\s:/@]+):([^\s/@]+)@/gi, (_m, head) => `${head}:‹redacted:url-credentials›@`],
  ['stripe-key', /\b[sprk]k_(?:live|test)_[A-Za-z0-9]{10,}\b/g, () => '‹redacted:stripe-key›'],
  ['ai-key', /\bsk-(?:ant-)?[A-Za-z0-9]{2,}-?[A-Za-z0-9_-]{16,}\b/g, () => '‹redacted:api-key›'],
  ['github-token', /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, () => '‹redacted:github-token›'],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, () => '‹redacted:slack-token›'],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/g, () => '‹redacted:aws-access-key›'],
  ['google-key', /\bAIza[0-9A-Za-z_-]{20,}\b/g, () => '‹redacted:google-key›'],
  // explicit sensitive assignment: password/secret/api_key/... = <value>
  ['secret-assignment',
    /\b(password|passwd|secret|api[_-]?key|apikey|access[_-]?token|client[_-]?secret|private[_-]?key)\b(\s*[:=]\s*)(['"]?)([^\s'",;]{4,})\3/gi,
    (_m, key, sep, q) => `${key}${sep}${q}‹redacted:secret›${q}`],
];

// Redact secret VALUES from a string, preserving everything else.
export function redact(text) {
  if (typeof text !== 'string' || !text) return text;
  let out = text;
  for (const [, re, repl] of RULES) out = out.replace(re, repl);
  return out;
}

// True if a string contains a detectable secret value (used by the library lint
// to warn an author who stored a raw secret — it should never have been written).
export function hasSecret(text) {
  if (typeof text !== 'string' || !text) return false;
  return RULES.some(([, re]) => { re.lastIndex = 0; return re.test(text); });
}

// Redact the human-facing fields of a library item (body/title) for output.
export const redactItem = (i) => ({ ...i, title: redact(i.title), body: redact(i.body) });
