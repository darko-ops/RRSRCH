"""Telemetry — built from day one so the savings claim is data, not estimate.
Every search logs an event; /metrics aggregates hit rate, tokens with/without, and
the miss/outcome breakdown."""
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


def metrics(events: list[dict[str, Any]], cold_path_estimate: int) -> dict[str, Any]:
    total = len(events)
    hits = sum(1 for e in events if e["outcome"] == "hit")
    saved = sum(e.get("tokens_saved_estimate") or 0 for e in events)
    spent = sum(e.get("tokens_spent_estimate") or 0 for e in events)
    reasons: dict[str, int] = {}
    for e in events:
        if e["outcome"] != "hit":
            reasons[e.get("reason") or "miss"] = reasons.get(e.get("reason") or "miss", 0) + 1
    without = total * cold_path_estimate
    return {
        "total_queries": total,
        "hits": hits,
        "misses": total - hits,
        "hit_rate": round(hits / total, 4) if total else 0.0,
        "tokens_with_rrsrch": spent,
        "tokens_without_rrsrch": without,
        "total_tokens_saved": saved,
        "avg_tokens_per_query_with": round(spent / total, 1) if total else 0.0,
        "avg_tokens_per_query_without": float(cold_path_estimate) if total else 0.0,
        "reduction_pct": round(100 * (1 - spent / without), 1) if without else 0.0,
        "miss_breakdown": reasons,
    }
