"""Query equivalence — the hit-rate problem.

Similarity is VECTOR cosine (deterministic given the model). On top of it sits the
SCOPE GATE: a candidate whose scope conflicts with the query's scope on any shared
key is rejected no matter how high the similarity — this is what stops us serving a
right answer to the wrong question ("S3 price in us-east-1" != "... in eu-west-1").

No LLM decides matches in Phase 0. A hook for an LLM re-ranker is noted but off."""
from __future__ import annotations

from typing import Any

import numpy as np

from .embedder import Embedder
from .schemas import DepositRecord
from .store import CorpusStore


def scope_conflict(query_scope: dict[str, Any], cand_scope: dict[str, Any]) -> bool:
    """True if the two scopes disagree on any shared key."""
    for key in set(query_scope) & set(cand_scope):
        if _norm(query_scope[key]) != _norm(cand_scope[key]):
            return True
    return False


def _norm(v: Any) -> Any:
    return v.strip().lower() if isinstance(v, str) else v


async def find_candidates(
    store: CorpusStore,
    embedder: Embedder,
    query: str,
    scope: dict[str, Any],
    *,
    k: int = 10,
    similarity_floor: float = 0.82,
) -> list[tuple[DepositRecord, float]]:
    """Nearest neighbors, scope-gated, above the similarity floor, best first."""
    q = embedder.encode([query])[0]
    raw = await store.vector_search(np.asarray(q), k=k)
    out: list[tuple[DepositRecord, float]] = []
    for rec, sim in raw:
        if sim < similarity_floor:
            continue
        if scope_conflict(scope, rec.scope):  # the gate: reject conflicting scope
            continue
        out.append((rec, sim))
    # (Optional Phase-2 hook: an LLM re-ranker could reorder `out` here. Off in Phase 0.)
    return out
