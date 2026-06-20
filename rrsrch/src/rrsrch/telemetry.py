"""Token accounting — the headline deliverable. If we can't prove the savings, we
don't have a product. Every search logs a query_event; this module estimates tokens
and aggregates the savings report."""
from __future__ import annotations

from typing import Any

try:  # tiktoken if available, else a len/4 heuristic
    import tiktoken

    _ENC = tiktoken.get_encoding("cl100k_base")

    def estimate_tokens(text: str) -> int:
        return len(_ENC.encode(text or ""))
except Exception:  # pragma: no cover - fallback path
    def estimate_tokens(text: str) -> int:
        return max(0, (len(text or "") + 3) // 4)


def savings_report(events: list[dict[str, Any]], cold_path_estimate: int) -> dict[str, Any]:
    """Aggregate query_events into the pitch-slide numbers."""
    total = len(events)
    hits = [e for e in events if e["outcome"] == "hit"]
    by_vol: dict[str, dict[str, int]] = {}
    saved = spent = 0
    for e in events:
        saved += e.get("tokens_saved_estimate") or 0
        spent += e.get("tokens_spent_estimate") or 0
        vol = e.get("volatility") or "unknown"
        b = by_vol.setdefault(vol, {"queries": 0, "hits": 0, "tokens_saved": 0})
        b["queries"] += 1
        b["hits"] += 1 if e["outcome"] == "hit" else 0
        b["tokens_saved"] += e.get("tokens_saved_estimate") or 0

    hit_rate = (len(hits) / total) if total else 0.0
    # With rrsrch: what we actually spent. Without: every query pays cold path.
    without = total * cold_path_estimate
    with_rrsrch = spent
    return {
        "total_queries": total,
        "hits": len(hits),
        "hit_rate": round(hit_rate, 4),
        "total_tokens_saved": saved,
        "tokens_with_rrsrch": with_rrsrch,
        "tokens_without_rrsrch": without,
        "avg_tokens_per_query_with": round(with_rrsrch / total, 1) if total else 0.0,
        "avg_tokens_per_query_without": float(cold_path_estimate) if total else 0.0,
        "reduction_pct": round(100 * (1 - with_rrsrch / without), 1) if without else 0.0,
        "by_volatility": by_vol,
    }
