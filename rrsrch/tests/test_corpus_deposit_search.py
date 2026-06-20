from __future__ import annotations

import asyncio
from datetime import timedelta

from rrsrch.schemas import DepositIn

run = asyncio.run


def test_deposit_sets_base_confidence_and_volatility(make_corpus):
    corpus, _ = make_corpus()
    rec = run(corpus.deposit(DepositIn(
        query="CMMC Level 2 assessment requirements",
        claim="CMMC L2 aligns to NIST SP 800-171's 110 controls; C3PAO assessment.",
        volatility_hint="low")))
    assert rec.base_confidence == 0.80
    assert rec.volatility == "low"


def test_search_hit_on_paraphrase(make_corpus):
    corpus, _ = make_corpus()
    run(corpus.deposit(DepositIn(
        query="CMMC Level 2 assessment requirements",
        claim="110 NIST 800-171 controls; assessed by a C3PAO.", volatility_hint="low")))
    out = run(corpus.search("what does CMMC level 2 require for assessment?"))
    assert out.outcome == "hit"
    assert out.confidence >= 0.70
    assert "C3PAO" in out.claim


def test_search_miss_on_empty(make_corpus):
    corpus, _ = make_corpus()
    out = run(corpus.search("anything at all"))
    assert out.outcome == "miss"


def test_search_stale_when_confidence_below_threshold(make_corpus):
    clock = None
    corpus, clk = make_corpus()
    # high-volatility claim deposited, then time jumps forward 3 days -> decays under 0.70.
    run(corpus.deposit(DepositIn(
        query="current S3 Standard price per GB", claim="$0.023/GB",
        volatility_hint="high")))
    clk.t = clk.t + timedelta(days=3)
    out = run(corpus.search("current S3 Standard price per GB"))
    assert out.outcome == "stale"
    assert out.confidence < 0.70
    assert out.deposit_id is not None


def test_scope_keeps_regions_separate(make_corpus):
    corpus, _ = make_corpus()
    run(corpus.deposit(DepositIn(query="S3 price per GB", claim="$0.023",
                                 scope={"region": "us-east-1"}, volatility_hint="medium")))
    miss = run(corpus.search("S3 price per GB", scope={"region": "eu-west-1"}))
    assert miss.outcome == "miss"  # different region must not be served
