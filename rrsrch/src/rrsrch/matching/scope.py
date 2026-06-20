"""Scope is a HARD GATE, applied BEFORE similarity — not a soft signal.

Two textually near-identical queries with different scope (S3 price us-east-1 vs
eu-west-1, API v3 vs v4) MUST NOT match. A false hit (right answer, wrong question)
is worse than a miss, so any conflict on a shared scope key rejects the candidate
outright, regardless of how high its similarity is."""
from __future__ import annotations

from typing import Any


def _norm(v: Any) -> Any:
    return v.strip().lower() if isinstance(v, str) else v


def conflicts(query_scope: dict[str, Any] | None, candidate_scope: dict[str, Any] | None) -> bool:
    """True if the scopes disagree on any shared key."""
    q = query_scope or {}
    c = candidate_scope or {}
    for key in set(q) & set(c):
        if _norm(q[key]) != _norm(c[key]):
            return True
    return False
