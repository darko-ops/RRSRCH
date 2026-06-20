"""Hybrid matching — the heart of Phase 0 (hit rate is the whole value prop).

Pipeline:
  1. Retrieve a candidate pool: lexical kNN ∪ vector kNN (from the store).
  2. SCOPE GATE (hard, first): drop any candidate whose scope conflicts with the
     query's — before any similarity is considered. A false hit is worse than a miss.
  3. Fuse: similarity = vector_weight * cosine + lexical_weight * lexical, both in [0,1].
  4. Rank by fused similarity; the best is a match only if it clears the (conservative,
     tunable) threshold.

No LLM decides matches. (A hook for an LLM re-ranker could sit between 3 and 4 in a
later phase; it is intentionally absent in Phase 0.)
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from ..embeddings import Embedder, cosine
from ..schemas import DepositRecord
from ..store.base import Store
from . import scope
from .lexical import lexical_score


@dataclass
class Match:
    record: DepositRecord
    similarity: float    # fused
    vector: float
    lexical: float


async def rank(
    store: Store, embedder: Embedder, query: str, query_scope: dict[str, Any] | None,
    *, k: int, vector_weight: float, lexical_weight: float,
) -> list[Match]:
    """Scope-gated, fused, ranked candidates (no threshold applied yet)."""
    qemb = embedder.encode([query])[0]
    pool = await store.candidate_pool(np.asarray(qemb), query, k)
    matches: list[Match] = []
    for rec in pool:
        if scope.conflicts(query_scope, rec.scope):   # HARD GATE, before similarity
            continue
        vec = cosine(qemb, rec.embedding)
        lex = lexical_score(query, rec.query)
        matches.append(Match(rec, vector_weight * vec + lexical_weight * lex, vec, lex))
    matches.sort(key=lambda m: m.similarity, reverse=True)
    return matches


async def best_match(
    store: Store, embedder: Embedder, query: str, query_scope: dict[str, Any] | None,
    *, k: int, vector_weight: float, lexical_weight: float, threshold: float,
) -> Match | None:
    ranked = await rank(store, embedder, query, query_scope, k=k,
                        vector_weight=vector_weight, lexical_weight=lexical_weight)
    if ranked and ranked[0].similarity >= threshold:
        return ranked[0]
    return None
