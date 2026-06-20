from __future__ import annotations

import asyncio

from rrsrch.schemas import DepositIn
from rrsrch.telemetry import estimate_tokens, savings_report

run = asyncio.run


def test_estimate_tokens_reasonable():
    assert estimate_tokens("") == 0
    assert estimate_tokens("hello world") > 0
    # longer text => more tokens
    assert estimate_tokens("a " * 200) > estimate_tokens("a " * 10)


def test_savings_report_math():
    events = [
        {"outcome": "hit", "tokens_saved_estimate": 89_000, "tokens_spent_estimate": 1_000, "volatility": "low"},
        {"outcome": "miss", "tokens_saved_estimate": 0, "tokens_spent_estimate": 90_000, "volatility": None},
    ]
    rep = savings_report(events, cold_path_estimate=90_000)
    assert rep["total_queries"] == 2
    assert rep["hits"] == 1
    assert rep["hit_rate"] == 0.5
    assert rep["total_tokens_saved"] == 89_000
    assert rep["tokens_without_rrsrch"] == 180_000
    assert rep["tokens_with_rrsrch"] == 91_000
    assert rep["reduction_pct"] == round(100 * (1 - 91_000 / 180_000), 1)
    assert rep["by_volatility"]["low"]["tokens_saved"] == 89_000


def test_report_from_real_corpus_hit(make_corpus):
    corpus, _ = make_corpus()
    run(corpus.deposit(DepositIn(query="CMMC Level 2 assessment requirements",
                                 claim="110 controls; C3PAO.", volatility_hint="low")))
    run(corpus.search("what does CMMC level 2 require for assessment?"))  # a hit
    rep = run(corpus.savings_report())
    assert rep["hits"] == 1
    assert rep["total_tokens_saved"] > 80_000  # cold path minus a tiny served answer
