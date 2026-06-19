// RRSRCH — local, keyless embeddings.
//
// Phase 2's semantic layer. The default provider is DETERMINISTIC and needs no
// model, no network, and no API key: it feature-hashes character n-grams (plus
// word tokens) into a fixed-dimension unit vector. That captures the similarity
// exact-token lexical matching misses — morphological variants ("webhook" ↔
// "webhooks"), shared subwords, typos — which is the failure class we saw in the
// eval. It is NOT a neural embedding (no true synonymy), but it is real vector
// retrieval that improves recall while keeping the eval deterministic and CI
// offline.
//
// PROVIDER INTERFACE: an embedder is just `(text: string) => Float32Array` of a
// fixed `dim`, L2-normalized so cosine == dot. Two documented upgrades slot in
// behind this same shape without touching the engine:
//   · a local neural model (e.g. Transformers.js MiniLM) for true semantics;
//   · sqlite-vec as the vector store once the library outgrows in-memory cosine.
// Both are opt-in; the deterministic provider stays the keyless default.

const DIM = 512;

// FNV-1a — a fast, deterministic, dependency-free string hash.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const tokenize = (s) => (s || '').toLowerCase().match(/[a-z0-9_]+/g) || [];

// Features for a token: the whole token plus its 3- and 4-grams, wrapped in word
// boundaries so prefixes/suffixes count (so "webhook" ⊂ "webhooks" overlaps).
function* features(token) {
  yield token;
  const w = `#${token}#`;
  for (const n of [3, 4]) for (let i = 0; i + n <= w.length; i++) yield w.slice(i, i + n);
}

// Default keyless embedder: signed feature hashing → L2-normalized vector.
export function hashEmbed(text, dim = DIM) {
  const v = new Float32Array(dim);
  for (const tok of tokenize(text)) {
    for (const f of features(tok)) {
      const h = fnv1a(f);
      const idx = h % dim;
      const sign = (fnv1a(f + '#sign') & 1) ? 1 : -1; // sign hashing curbs collision bias
      v[idx] += sign;
    }
  }
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dim; i++) v[i] /= norm;
  return v;
}

// Cosine similarity of two same-length vectors (== dot for unit vectors).
export function cosine(a, b) {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

// The default provider object the engine/CLI/MCP reach for when embeddings are
// enabled. Swap `embed` for a neural provider with the same signature later.
export const defaultProvider = { name: 'hash-ngram', dim: DIM, embed: (t) => hashEmbed(t, DIM) };
