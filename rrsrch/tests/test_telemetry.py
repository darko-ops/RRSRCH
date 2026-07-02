from __future__ import annotations

from rrsrch.telemetry import estimate_tokens, metrics


def test_estimate_tokens_scales_with_text():
    assert estimate_tokens("") == 0
    assert 0 < estimate_tokens("short claim") < estimate_tokens("a much longer claim " * 50)


def test_metrics_empty():
    m = metrics({"by_outcome": {}, "reasons": {}, "tokens_saved": 0, "tokens_spent": 0}, 90_000)
    assert m["total_queries"] == 0 and m["hit_rate"] == 0.0 and m["reduction_pct"] == 0.0


def test_metrics_math():
    stats = {
        "by_outcome": {"hit": 3, "stale": 1, "miss": 1, "agreed": 2, "disagreed": 1},
        "reasons": {"confidence_below_threshold": 1, "no_match": 1},
        "tokens_saved": 3 * 89_900,
        "tokens_spent": 3 * 100 + 2 * 90_000,   # 3 cheap hits + stale & miss at cold cost
    }
    m = metrics(stats, 90_000)
    assert m["total_queries"] == 5           # corroborations are not queries
    assert m["hits"] == 3 and m["stale"] == 1 and m["misses"] == 1
    assert m["hit_rate"] == 0.6
    assert m["corroborations"] == {"agreed": 2, "disagreed": 1}
    assert m["tokens_without_rrsrch"] == 5 * 90_000
    assert m["total_tokens_saved"] == 3 * 89_900
    assert 0 < m["reduction_pct"] < 100
    assert m["no_serve_breakdown"] == {"confidence_below_threshold": 1, "no_match": 1}
