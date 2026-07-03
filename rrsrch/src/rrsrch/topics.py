"""Topics — deterministic clustering of deposits for the exploration bandit.

=============================================================================
THE INVIOLABLE RULE: topic assignment is DETERMINISTIC code (an exact scope
partition + a leader-clustering cosine threshold). No LLM, no random init.
Re-running the same deposits in the same order yields the same topics.
=============================================================================

A "topic" = deposits sharing a normalized scope AND sitting within
`topic_similarity_threshold` cosine of the topic's centroid. Leader
clustering: the first deposit that opens a topic donates its embedding as the
centroid, permanently — no centroid drift, so membership of later deposits
can never be reshuffled by insertion order within the topic. A deposit belongs
to exactly one topic: the best (highest-cosine) qualifying centroid wins;
ties break on topic_id so the choice is total-ordered and reproducible.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import numpy as np

from . import exploration
from .embeddings import cosine
from .schemas import TopicState
from .store.base import Store


def scope_key(scope: dict[str, Any] | None) -> str:
    """Canonical, normalized scope identity — the hard partition between topics."""
    if not scope:
        return ""
    norm = {str(k).strip().lower(): (v.strip().lower() if isinstance(v, str) else v)
            for k, v in scope.items()}
    return json.dumps(norm, sort_keys=True, separators=(",", ":"))


async def assign(store: Store, embedding: np.ndarray, scope: dict[str, Any] | None,
                 volatility: str, now: datetime, settings) -> str:
    """Find-or-create the topic for a deposit. Deterministic given store contents."""
    key = scope_key(scope)
    candidates = await store.topics_for_scope(key)
    best: TopicState | None = None
    best_sim = -1.0
    for t in sorted(candidates, key=lambda t: t.topic_id):   # total order → reproducible
        sim = cosine(embedding, t.centroid)
        if sim >= settings.topic_similarity_threshold and sim > best_sim:
            best, best_sim = t, sim
    if best is not None:
        return best.topic_id

    topic = TopicState(
        topic_id=f"t-{_stable_id(key, embedding)}",
        scope_key=key,
        centroid=np.asarray(embedding, dtype=np.float32),
        base_volatility=volatility,
        exploration_rate=exploration.seed_rate(volatility, settings),
        created_at=now,
    )
    await store.upsert_topic(topic)
    return topic.topic_id


def _stable_id(key: str, embedding: np.ndarray) -> str:
    """Content-derived id: same leader scope+embedding ⇒ same topic id on re-run."""
    import hashlib
    h = hashlib.sha256()
    h.update(key.encode())
    h.update(np.asarray(embedding, dtype=np.float32).tobytes())
    return h.hexdigest()[:16]
