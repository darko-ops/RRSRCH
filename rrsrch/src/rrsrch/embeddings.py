"""Embeddings behind one interface, pluggable via config:
  - "local": sentence-transformers (all-MiniLM-L6-v2), runs with no API key.
  - "hash":  deterministic char-n-gram hash embedder (numpy only) — offline default
             for eval/tests; captures lexical/morphological similarity, not deep semantics.
  - "api":   a hosted embedding endpoint (env RRSRCH_EMBEDDING_API_URL).
"""
from __future__ import annotations

import re
from typing import Protocol, Sequence

import numpy as np


class Embedder(Protocol):
    dim: int
    def encode(self, texts: Sequence[str]) -> np.ndarray: ...  # (n, dim), L2-normalized


def _l2(m: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(m, axis=1, keepdims=True)
    n[n == 0] = 1.0
    return m / n


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = float(np.linalg.norm(a)), float(np.linalg.norm(b))
    return 0.0 if na == 0 or nb == 0 else float(np.dot(a, b) / (na * nb))


def _fnv1a(s: str) -> int:
    h = 0x811C9DC5
    for ch in s:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


class HashEmbedder:
    def __init__(self, dim: int = 384) -> None:
        self.dim = dim

    @staticmethod
    def _features(text: str):
        for tok in re.findall(r"[a-z0-9]+", (text or "").lower()):
            yield tok
            w = f"#{tok}#"
            for n in (3, 4):
                for i in range(len(w) - n + 1):
                    yield w[i : i + n]

    def encode(self, texts: Sequence[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dim), dtype=np.float32)
        out = np.zeros((len(texts), self.dim), dtype=np.float32)
        for r, t in enumerate(texts):
            for f in self._features(t):
                out[r, _fnv1a(f) % self.dim] += 1.0 if (_fnv1a(f + "#s") & 1) else -1.0
        return _l2(out)


class LocalSentenceTransformerEmbedder:
    def __init__(self, model: str = "all-MiniLM-L6-v2", dim: int = 384) -> None:
        from sentence_transformers import SentenceTransformer  # lazy optional dep

        self._m = SentenceTransformer(model)
        self.dim = dim

    def encode(self, texts: Sequence[str]) -> np.ndarray:
        v = self._m.encode(list(texts), normalize_embeddings=True, convert_to_numpy=True)
        return np.asarray(v, dtype=np.float32).reshape(len(texts), -1)


def get_embedder(settings) -> Embedder:
    if settings.embedder == "hash":
        return HashEmbedder(settings.embedding_dim)
    if settings.embedder == "api":
        from .embeddings_api import ApiEmbedder  # lazy; only if configured

        return ApiEmbedder(settings.embedding_api_url, settings.embedding_dim)
    return LocalSentenceTransformerEmbedder(settings.embedding_model, settings.embedding_dim)
