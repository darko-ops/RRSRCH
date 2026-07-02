"""Telemetry — built from day one so the savings claim is data, not estimate.
Every search logs an event; /metrics aggregates hit rate, tokens with/without, and
the stale/miss breakdown. Aggregation happens store-side (SQL GROUP BY in Postgres)
so metrics never pulls every event row into Python."""
from __future__ import annotations

from typing import Any

try:
    import tiktoken

    _ENC = tiktoken.get_encoding("cl100k_base")

    def estimate_tokens(text: str) -> int:
        return len(_ENC.encode(text or ""))
except Exception:  # pragma: no cover
    def estimate_tokens(text: str) -> int:
        return max(0, (len(text or "") + 3) // 4)


def metrics(stats: dict[str, Any], cold_path_estimate: int,
            topic_states: dict[str, dict[str, Any]] | None = None) -> dict[str, Any]:
    """Derive the savings report from store-side aggregates.

    `stats` = {by_outcome: {outcome: n}, reasons: {reason: n}, tokens_saved,
               tokens_spent, exploration_tokens_spent, by_topic, mean_ttc}
    Searches are hit/stale/miss; agreed/disagreed are corroborations and
    'explore' is verification spend — reported separately, excluded from query
    counts, but INCLUDED in tokens_with_rrsrch (the savings claim stays honest:
    exploration is a cost the system pays to keep the cache safe).
    """
    by = stats.get("by_outcome", {})
    hits = by.get("hit", 0)
    stale = by.get("stale", 0)
    misses = by.get("miss", 0)
    total = hits + stale + misses
    saved = stats.get("tokens_saved", 0)
    spent = stats.get("tokens_spent", 0)
    without = total * cold_path_estimate
    by_topic = stats.get("by_topic", {})
    topics = {tid: {**state, **by_topic.get(tid, {})}
              for tid, state in (topic_states or {}).items()}
    for tid, flow in by_topic.items():   # events for topics with no live state row
        topics.setdefault(tid, dict(flow))
    return {
        "total_queries": total,
        "hits": hits,
        "stale": stale,
        "misses": misses,
        "hit_rate": round(hits / total, 4) if total else 0.0,
        "corroborations": {"agreed": by.get("agreed", 0), "disagreed": by.get("disagreed", 0)},
        "tokens_with_rrsrch": spent,
        "tokens_without_rrsrch": without,
        "total_tokens_saved": saved,
        "avg_tokens_per_query_with": round(spent / total, 1) if total else 0.0,
        "avg_tokens_per_query_without": float(cold_path_estimate) if total else 0.0,
        "reduction_pct": round(100 * (1 - spent / without), 1) if without else 0.0,
        "no_serve_breakdown": stats.get("reasons", {}),
        # --- Phase 1: the budget flow ---
        "exploration": {
            "events": by.get("explore", 0),
            "tokens_spent": stats.get("exploration_tokens_spent", 0),
        },
        "mean_time_to_correction_seconds": stats.get("mean_time_to_correction_seconds"),
        "topics": topics,
    }
