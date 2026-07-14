"""Cross-encoder RERANKER — the second-stage matcher behind one interface.

=============================================================================
THE INVIOLABLE RULE, applied: matching/similarity is the ONE zone where a
model may judge ("is this candidate the same question?"). The reranker scores
(query, candidate-query) pairs for answer-relevance and REPLACES the fused-
cosine threshold as the serve-signal — nothing else. The deterministic safety
gates (scope, polarity/predicate) still veto BEFORE it; the deterministic
trust/confidence/serve pipeline is untouched AFTER it. A reranker must never
compute confidence, decide explore-vs-exploit, or render agreement verdicts.
=============================================================================

Why it exists: a bi-encoder embeds each question alone, so "what's the
deadline?" and "who must comply?" — same topic, different question — land at
cosine 0.57+ and a threshold cannot separate them from true paraphrases
(reports/organic.md measured a 33% false-hit rate at 0.525). A cross-encoder
reads BOTH texts jointly and scores whether they ask the same thing.

Model choice (selected on the CALIBRATION slice of eval/equivalence_pairs.json
only — see reports/reranker.md): stsb-roberta-base (semantic textual
similarity). Passage-relevance models (ms-marco) fail here — every question in
a vertical is "relevant" to every other; STS scores same-MEANING, which is the
actual serve question. STS models emit scores already in [0, 1]; relevance
models emit logits — hence the `activation` knob ("native" vs "sigmoid").

Implementations, pluggable via config (like the embedder):
  - "local": sentence-transformers CrossEncoder, CPU, offline after first
             download, no API tokens.
  - "none":  reranking disabled — the Phase-2 fused-threshold path, unchanged.
Tests inject FakeReranker so the suite never needs the model.
"""
from __future__ import annotations

import asyncio
from functools import lru_cache
from typing import Protocol, Sequence

import numpy as np

DEFAULT_MODEL = "cross-encoder/stsb-roberta-base"


class Reranker(Protocol):
    def score(self, query: str, candidates: Sequence[str]) -> list[float]:
        """Relevance of each candidate question to the query, each in [0, 1]."""
        ...


async def score_async(reranker: Reranker, query: str,
                      candidates: Sequence[str]) -> list[float]:
    """Run score() off the event loop — cross-encoder inference is CPU-bound
    and blocks, exactly like Embedder.encode (see embeddings.encode_async)."""
    return await asyncio.to_thread(reranker.score, query, candidates)


@lru_cache(maxsize=4)
def _load_cross_encoder(model: str):
    """Model load is ~seconds and ~90MB — cache per model name, process-wide."""
    from sentence_transformers import CrossEncoder  # lazy optional dep

    return CrossEncoder(model)


def apply_veto(scores: Sequence[float], veto_scores: Sequence[float],
               floor: float) -> list[float]:
    """Conjunction as a single score: a candidate whose VETO score falls below
    the floor scores 0.0 (can never clear any serve threshold); otherwise the
    primary score passes through untouched. Keeps the serve path one-threshold."""
    return [0.0 if v < floor else float(s) for s, v in zip(scores, veto_scores)]


class CrossEncoderReranker:
    """Local cross-encoder. `activation="native"` trusts the model's own output
    scale (STS models emit [0, 1]); `"sigmoid"` squashes raw logits for
    relevance models (ms-marco) so the threshold lives on one fixed scale.

    Optional VETO model (measured on the calibration slice, reports/reranker.md):
    the STS primary is the recall signal but is fooled by lexically-twinned
    different questions ("assessment takes how long" vs "certification valid how
    long" scores 0.96); a QQP duplicate-question model is strict on exactly that
    class, so requiring a LOW floor from it kills those without costing recall."""

    def __init__(self, model: str = DEFAULT_MODEL, activation: str = "native",
                 veto_model: str | None = None, veto_floor: float = 0.0) -> None:
        if activation not in ("native", "sigmoid"):
            raise ValueError(f"unknown rerank activation {activation!r}")
        self._m = _load_cross_encoder(model)
        self._sigmoid = activation == "sigmoid"
        self._veto = _load_cross_encoder(veto_model) if veto_model else None
        self._veto_floor = veto_floor

    def _predict(self, model, pairs: Sequence[tuple[str, str]]) -> list[float]:
        out = np.asarray(model.predict(list(pairs)), dtype=np.float64)
        if self._sigmoid:
            out = 1.0 / (1.0 + np.exp(-out))
        return [float(s) for s in out]

    def score_pairs(self, pairs: Sequence[tuple[str, str]]) -> list[float]:
        """Batch entry point (the eval harness uses this) — the ONE scoring
        path, so offline calibration and the live serve path cannot diverge."""
        if not pairs:
            return []
        scores = self._predict(self._m, pairs)
        if self._veto is not None:
            scores = apply_veto(scores, self._predict(self._veto, pairs),
                                self._veto_floor)
        return scores

    def score(self, query: str, candidates: Sequence[str]) -> list[float]:
        return self.score_pairs([(query, c) for c in candidates])


class FakeReranker:
    """Deterministic stub for unit tests — no model, no download. Scores come
    from an exact (query, candidate) mapping, else `default`."""

    def __init__(self, scores: dict[tuple[str, str], float] | None = None,
                 default: float = 1.0) -> None:
        self.scores = scores or {}
        self.default = default
        self.calls: list[tuple[str, tuple[str, ...]]] = []

    def score(self, query: str, candidates: Sequence[str]) -> list[float]:
        self.calls.append((query, tuple(candidates)))
        return [self.scores.get((query, c), self.default) for c in candidates]


def get_reranker(settings) -> Reranker | None:
    """None ⇒ reranking disabled (the Phase-2 fused-threshold serve path)."""
    if settings.reranker == "none":
        return None
    if settings.reranker in ("local", "cross-encoder"):
        return CrossEncoderReranker(settings.rerank_model, settings.rerank_activation,
                                    veto_model=settings.rerank_veto_model or None,
                                    veto_floor=settings.rerank_veto_floor)
    raise ValueError(f"unknown reranker {settings.reranker!r} "
                     "(expected none|local|cross-encoder)")
