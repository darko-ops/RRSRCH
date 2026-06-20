from __future__ import annotations

import asyncio
from datetime import timedelta

from rrsrch.schemas import DepositIn

run = asyncio.run


def test_deposit_then_warm_hit(make_corpus):
    corpus, _ = make_corpus()
    run(corpus.deposit(DepositIn(
        query="CMMC Level 2 assessment requirements",
        claim="110 NIST 800-171 controls; assessed by a C3PAO.", volatility_hint="low")))
    out = run(corpus.search("what does CMMC level 2 require for assessment?"))
    assert out.serve is True and out.outcome == "hit"
    assert "C3PAO" in out.claim
    assert out.confidence >= 0.5 and out.similarity >= corpus.settings.similarity_threshold


def test_cold_miss_returns_structured_miss(make_corpus):
    corpus, _ = make_corpus()
    out = run(corpus.search("anything not in the corpus"))
    assert out.serve is False and out.outcome == "miss" and out.reason == "no_match"


def test_scope_mismatch_is_a_miss_not_a_false_hit(make_corpus):
    corpus, _ = make_corpus()
    run(corpus.deposit(DepositIn(query="S3 Standard price per GB", claim="$0.023",
                                 scope={"region": "us-east-1"}, volatility_hint="medium")))
    out = run(corpus.search("S3 Standard price per GB", scope={"region": "eu-west-1"}))
    assert out.serve is False  # different region must never be served


def test_stale_high_volatility_is_a_miss(make_corpus):
    corpus, clk = make_corpus()
    run(corpus.deposit(DepositIn(query="current S3 Standard price per GB", claim="$0.023",
                                 volatility_hint="high")))
    clk.t = clk.t + timedelta(days=2)
    out = run(corpus.search("current S3 Standard price per GB"))
    assert out.serve is False and out.reason == "stale_below_threshold"
    assert out.confidence is not None and out.confidence < corpus.settings.freshness_threshold


def test_metrics_record_savings(make_corpus):
    corpus, _ = make_corpus()
    run(corpus.deposit(DepositIn(query="CMMC Level 2 assessment requirements",
                                 claim="110 controls; C3PAO.", volatility_hint="low")))
    run(corpus.search("what does CMMC level 2 require for assessment?"))  # hit
    run(corpus.search("totally unrelated"))                               # miss
    m = run(corpus.metrics())
    assert m["total_queries"] == 2 and m["hits"] == 1 and m["hit_rate"] == 0.5
    assert m["total_tokens_saved"] > 80_000
