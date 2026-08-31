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
    saved_measured = stats.get("tokens_saved_measured", 0)
    hits_measured = stats.get("hits_measured_basis", 0)
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
        # the honest split: measured = hits whose deposit carried its real
        # production cost (savings = that cost - served); estimated = the rest
        "tokens_saved_measured": saved_measured,
        "tokens_saved_estimated": saved - saved_measured,
        "hits_measured_basis": hits_measured,
        "hits_estimated_basis": hits - hits_measured,
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
        **_cost_ledger(stats, cold_path_estimate, hits, total, saved),
    }


def _cost_ledger(stats: dict[str, Any], cold_path_estimate: int,
                 hits: int, total: int, saved: int) -> dict[str, Any]:
    """The five recorded cost facts, kept separate from the estimate-based
    headline above so neither can silently borrow the other's credibility.

    Everything here is an ACTUAL unless a field says otherwise: derivation and
    verification costs are the numbers their producers reported, and
    `*_coverage_pct` states what fraction of runs reported one at all. A
    coverage of 0 means the corresponding total is 0 because nothing was
    measured — NOT because nothing was spent."""
    d_n = stats.get("derivations", 0)
    d_meas = stats.get("derivations_measured", 0)
    d_actual = stats.get("derivation_tokens_actual", 0)
    d_mean = round(d_actual / d_meas, 1) if d_meas else None

    v_runs = stats.get("verification_runs", 0)
    v_meas = stats.get("verification_runs_measured", 0)
    v_tokens_measured = stats.get("verification_tokens_measured", 0)
    v_spend_all = stats.get("exploration_tokens_spent", 0)
    v_agreed = stats.get("verification_agreed", 0)
    v_disagreed = stats.get("verification_disagreed", 0)
    v_settled = v_agreed + v_disagreed

    return {
        # 1 — actual tokens for every cold derivation
        "derivation_cost": {
            "derivations": d_n,
            "measured": d_meas,
            "coverage_pct": round(100 * d_meas / d_n, 1) if d_n else 0.0,
            "actual_tokens_total": d_actual,
            "actual_tokens_mean": d_mean,
            "configured_estimate": cold_path_estimate,
            # how wrong the configured cold-path assumption is against reality:
            # positive ⇒ the estimate OVERSTATES real cost, inflating savings
            "estimate_bias_pct": (round(100 * (cold_path_estimate - d_mean) / d_mean, 1)
                                  if d_mean else None),
        },
        # 2 — actual verification cost
        "verification_cost": {
            "runs": v_runs,
            "measured_runs": v_meas,
            "coverage_pct": round(100 * v_meas / v_runs, 1) if v_runs else 0.0,
            "actual_tokens_measured": v_tokens_measured,
            "tokens_spent_total": v_spend_all,
            "actual_tokens_mean": (round(v_tokens_measured / v_meas, 1) if v_meas else None),
        },
        # 3 — warm-hit frequency
        "warm_hits": {
            "hits": hits,
            "queries": total,
            "frequency_pct": round(100 * hits / total, 2) if total else 0.0,
            "tokens_served_total": stats.get("hit_tokens_served", 0),
            "tokens_served_mean": (round(stats.get("hit_tokens_served", 0) / hits, 1)
                                   if hits else None),
        },
        # 4 — stale-verification success rate. "Success" = the loop ran AND the
        # cached claim survived it (agreed). A disagreed run is not a failure of
        # the loop — it is the loop working — so both are reported and the rate
        # is explicitly the cache-still-valid rate.
        "stale_verification": {
            "runs_settled": v_settled,
            "confirmed_still_valid": v_agreed,
            "superseded": v_disagreed,
            "cache_still_valid_pct": (round(100 * v_agreed / v_settled, 1)
                                      if v_settled else None),
        },
        # 5 — net tokens saved AFTER verification spending
        "net_savings": {
            "gross_tokens_saved": saved,
            "verification_tokens_spent": v_spend_all,
            "net_tokens_saved": saved - v_spend_all,
            "verification_drag_pct": (round(100 * v_spend_all / saved, 2) if saved else 0.0),
        },
    }
