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


# ---------------------------------------------- the five recorded cost facts


def _ledger_stats(**over):
    base = {
        "by_outcome": {"hit": 4, "stale": 1, "miss": 1, "explore": 3,
                       "agreed": 2, "disagreed": 1, "derive": 2},
        "reasons": {}, "tokens_saved": 300_000, "tokens_spent": 200_000,
        "exploration_tokens_spent": 15_000,
        "derivations": 2, "derivations_measured": 1, "derivation_tokens_actual": 60_000,
        "verification_runs": 3, "verification_runs_measured": 2,
        "verification_tokens_measured": 10_000,
        "hit_tokens_served": 88,
        "verification_agreed": 2, "verification_disagreed": 1,
    }
    base.update(over)
    return base


def test_records_actual_cold_derivation_cost_and_flags_estimate_bias():
    d = metrics(_ledger_stats(), 90_000)["derivation_cost"]
    assert d["derivations"] == 2 and d["measured"] == 1
    assert d["coverage_pct"] == 50.0          # half the derivations reported a cost
    assert d["actual_tokens_total"] == 60_000
    assert d["actual_tokens_mean"] == 60_000  # mean over MEASURED runs only
    # the configured 90k estimate overstates the measured 60k by 50%
    assert d["estimate_bias_pct"] == 50.0


def test_records_actual_verification_cost_separately_from_fallback():
    v = metrics(_ledger_stats(), 90_000)["verification_cost"]
    assert v["runs"] == 3 and v["measured_runs"] == 2
    assert v["actual_tokens_measured"] == 10_000
    assert v["actual_tokens_mean"] == 5_000
    # total spend includes the run that fell back to the estimate
    assert v["tokens_spent_total"] == 15_000


def test_records_warm_hit_frequency():
    w = metrics(_ledger_stats(), 90_000)["warm_hits"]
    assert w["hits"] == 4 and w["queries"] == 6      # corroborations aren't queries
    assert w["frequency_pct"] == 66.67
    assert w["tokens_served_mean"] == 22.0


def test_records_stale_verification_success_rate():
    s = metrics(_ledger_stats(), 90_000)["stale_verification"]
    assert s["runs_settled"] == 3
    assert s["confirmed_still_valid"] == 2 and s["superseded"] == 1
    assert s["cache_still_valid_pct"] == 66.7


def test_records_net_savings_after_verification_spend():
    n = metrics(_ledger_stats(), 90_000)["net_savings"]
    assert n["gross_tokens_saved"] == 300_000
    assert n["verification_tokens_spent"] == 15_000
    assert n["net_tokens_saved"] == 285_000
    assert n["verification_drag_pct"] == 5.0


def test_ledger_reports_zero_coverage_without_claiming_zero_cost():
    # nothing measured: totals are 0 because nothing REPORTED, and the
    # coverage/None fields must say so rather than implying free work
    m = metrics(_ledger_stats(derivations_measured=0, derivation_tokens_actual=0,
                              verification_runs_measured=0,
                              verification_tokens_measured=0), 90_000)
    assert m["derivation_cost"]["coverage_pct"] == 0.0
    assert m["derivation_cost"]["actual_tokens_mean"] is None
    assert m["derivation_cost"]["estimate_bias_pct"] is None
    assert m["verification_cost"]["actual_tokens_mean"] is None
    # but real spend is still reported
    assert m["verification_cost"]["tokens_spent_total"] == 15_000


# ------------------------------------------- end-to-end: the ledger is REAL


async def test_cost_ledger_is_populated_by_real_operations(make_corpus):
    """Drives deposit / hit / verification through the corpus and asserts the
    five facts come from actual logged events, not from the estimate path."""
    from tests.conftest import FakeProvider
    from rrsrch.schemas import DepositIn, Source

    src = [Source(url="https://example.test/e")]
    provider = FakeProvider(answer="The retention period is 3 years.", tokens_spent=4_000)
    corpus, clk = make_corpus(provider=provider)

    # a derivation that REPORTS its real cost, and one that does not
    await corpus.deposit(DepositIn(query="how long must audit logs be retained",
                                   claim="Audit logs must be retained for 3 years.",
                                   sources=src, volatility_hint="low",
                                   derivation_tokens=52_000))
    await corpus.deposit(DepositIn(query="which cipher suite is mandated for transit",
                                   claim="TLS 1.2 or higher is mandated.", sources=src,
                                   volatility_hint="low"))
    r = await corpus.search("how long must audit logs be retained")
    assert r.serve is True

    m = await corpus.metrics()

    # 1 — actual cold-derivation cost, with honest coverage
    d = m["derivation_cost"]
    assert d["derivations"] == 2 and d["measured"] == 1
    assert d["actual_tokens_total"] == 52_000 and d["coverage_pct"] == 50.0

    # 3 — warm-hit frequency, and the served cost is tiny but non-zero
    w = m["warm_hits"]
    assert w["hits"] == 1 and w["queries"] == 1 and w["frequency_pct"] == 100.0
    assert 0 < w["tokens_served_total"] < 1_000

    # a MEASURED deposit makes its hit's savings measured, not estimated
    assert m["hits_measured_basis"] == 1 and m["tokens_saved_measured"] > 0

    # 5 — with no verification yet, net == gross and drag is zero
    assert m["net_savings"]["net_tokens_saved"] == m["net_savings"]["gross_tokens_saved"]
    assert m["net_savings"]["verification_drag_pct"] == 0.0


async def test_verification_cost_and_success_rate_come_from_the_loop(make_corpus):
    from tests.conftest import FakeProvider
    from rrsrch.schemas import DepositIn, Source

    src = [Source(url="https://example.test/e")]
    # the provider returns the SAME claim → verification agrees → cache still valid
    provider = FakeProvider(answer="Audit logs must be retained for 3 years.",
                            tokens_spent=4_000)
    corpus, clk = make_corpus(provider=provider)
    rec = await corpus.deposit(DepositIn(query="how long must audit logs be retained",
                                         claim="Audit logs must be retained for 3 years.",
                                         sources=src, volatility_hint="low"))
    topic = await corpus.store.get_topic(rec.topic_id)
    await corpus._explore(rec, topic, trigger="verify")

    m = await corpus.metrics()
    v = m["verification_cost"]
    assert v["runs"] == 1 and v["measured_runs"] == 1
    assert v["actual_tokens_measured"] == 4_000      # the provider's REAL cost
    assert v["actual_tokens_mean"] == 4_000

    # 4 — the loop ran and the cached claim survived it
    s = m["stale_verification"]
    assert s["runs_settled"] == 1
    assert s["confirmed_still_valid"] == 1 and s["superseded"] == 0
    assert s["cache_still_valid_pct"] == 100.0

    # 5 — verification spend is subtracted from gross savings
    n = m["net_savings"]
    assert n["verification_tokens_spent"] == 4_000
    assert n["net_tokens_saved"] == n["gross_tokens_saved"] - 4_000
