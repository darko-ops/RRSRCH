"""Embeddings behind an interface so the model is swappable and the corpus logic
is testable offline.

Two implementations:
  - LocalSentenceTransformerEmbedder: the deployable path (all-MiniLM-L6-v2, 384-dim,
    fully local/offline — no embedding API). Lazy-imports sentence_transformers so this
    module loads even where that package isn't installed.
  - HashEmbedder: a deterministic char-n-gram hash embedder (numpy only). No model, no
    network, reproducible — used in tests and as a zero-dependency fallback. It captures
    lexical/morphological similarity (enough to match a paraphrase), not deep semantics.
"""
from __future__ import annotations

from typing import Protocol, Sequence

import numpy as np


class Embedder(Protocol):
    dim: int
    def encode(self, texts: Sequence[str]) -> np.ndarray: ...  # (n, dim), L2-normalized


def _l2_normalize(m: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(m, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return m / norms


def _tokens(text: str) -> list[str]:
    import re
    return re.findall(r"[a-z0-9]+", (text or "").lower())


class HashEmbedder:
    """Deterministic feature-hashing embedder: word tokens + 3/4-char n-grams hashed
    (with a sign hash) into `dim` buckets, L2-normalized. Same text -> same vector."""

    def __init__(self, dim: int = 384) -> None:
        self.dim = dim

    @staticmethod
    def _features(text: str):
        for tok in _tokens(text):
            yield tok
            w = f"#{tok}#"
            for n in (3, 4):
                for i in range(len(w) - n + 1):
                    yield w[i : i + n]

    def _embed_one(self, text: str) -> np.ndarray:
        v = np.zeros(self.dim, dtype=np.float32)
        for f in self._features(text):
            h = hash_str(f)
            sign = 1.0 if (hash_str(f + "#sign") & 1) else -1.0
            v[h % self.dim] += sign
        return v

    def encode(self, texts: Sequence[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dim), dtype=np.float32)
        return _l2_normalize(np.vstack([self._embed_one(t) for t in texts]))


class LocalSentenceTransformerEmbedder:
    """Production embedder: local sentence-transformers model. Offline once cached."""

    def __init__(self, model_name: str = "all-MiniLM-L6-v2", dim: int = 384) -> None:
        from sentence_transformers import SentenceTransformer  # lazy: optional dependency

        self._model = SentenceTransformer(model_name)
        self.dim = dim

    def encode(self, texts: Sequence[str]) -> np.ndarray:
        vecs = self._model.encode(list(texts), normalize_embeddings=True, convert_to_numpy=True)
        return np.asarray(vecs, dtype=np.float32).reshape(len(texts), -1)


def hash_str(s: str) -> int:
    """Deterministic FNV-1a (Python's built-in hash() is salted per-process)."""
    h = 0x811C9DC5
    for ch in s:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def get_embedder(settings) -> Embedder:
    if settings.embedder == "hash":
        return HashEmbedder(dim=settings.embedding_dim)
    return LocalSentenceTransformerEmbedder(settings.embedding_model, settings.embedding_dim)


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine of two 1-D vectors (assumes finite; handles zero vectors)."""
    na, nb = float(np.linalg.norm(a)), float(np.linalg.norm(b))
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))
