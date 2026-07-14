"""Reranked serve path — FakeReranker only: the suite never loads (or
downloads) the cross-encoder model. The rerank score replaces the fused
threshold as the match signal; everything deterministic around it (scope,
polarity/predicate gates, confidence decay, stale) must behave exactly as on
the fused path."""
from __future__ import annotations

from datetime import timedelta

import pytest

from rrsrch import agreement
from rrsrch.matching.rerank import FakeReranker, get_reranker
from rrsrch.schemas import DepositIn
from tests.conftest import offline_settings

Q_DEP = "How long is a CMMC certification valid?"
Q_ASK = "How long is my CMMC certification valid for?"


def rerank_corpus(make_corpus, fake: FakeReranker, **over):
    corpus, clk = make_corpus(**{"rerank_threshold": 0.60, **over})
    corpus.reranker = fake              # injected: settings stay reranker="none"
    return corpus, clk


async def test_reranker_disabled_by_default(make_corpus):
    corpus, _ = make_corpus()
    assert corpus.reranker is None
    assert get_reranker(offline_settings()) is None


def test_get_reranker_rejects_unknown():
    with pytest.raises(ValueError):
        get_reranker(offline_settings(reranker="quantum"))


async def test_rerank_score_serves_above_threshold(make_corpus):
    fake = FakeReranker({(Q_ASK, Q_DEP): 0.93}, default=0.05)
    corpus, _ = rerank_corpus(make_corpus, fake)
    await corpus.deposit(DepositIn(query=Q_DEP, claim="3 years"))
    res = await corpus.search(Q_ASK)
    assert res.serve and res.outcome == "hit" and res.claim == "3 years"
    assert fake.calls  # the cross-encoder, not the fused threshold, decided


async def test_rerank_blocks_topically_close_non_answer(make_corpus):
    # fused similarity would clear the threshold (paraphrase-grade wording);
    # the reranker says "same topic, different question" and blocks the serve.
    fake = FakeReranker(default=0.10)
    corpus, _ = rerank_corpus(make_corpus, fake)
    await corpus.deposit(DepositIn(query=Q_DEP, claim="3 years"))
    res = await corpus.search(Q_ASK)
    assert not res.serve and res.outcome == "miss"
    assert res.reason == "below_rerank_threshold"


async def test_rerank_orders_by_score_not_similarity(make_corpus):
    # the lexically-closer deposit loses to the one the reranker scores higher
    near = "How long is my CMMC certification valid, roughly?"
    fake = FakeReranker({(Q_ASK, near): 0.30, (Q_ASK, Q_DEP): 0.95}, default=0.0)
    corpus, _ = rerank_corpus(make_corpus, fake)
    await corpus.deposit(DepositIn(query=near, claim="wrong pick"))
    await corpus.deposit(DepositIn(query=Q_DEP, claim="right pick"))
    res = await corpus.search(Q_ASK)
    assert res.serve and res.claim == "right pick"


async def test_safety_gates_veto_before_rerank(make_corpus):
    # a predicate flip (enable vs disable) must miss even at rerank score 1.0 —
    # the deterministic intent guard runs BEFORE the model may judge.
    corpus, _ = rerank_corpus(make_corpus, FakeReranker(default=1.0))
    await corpus.deposit(DepositIn(query="How do I enable disk encryption on the laptops?",
                                   claim="turn it on"))
    res = await corpus.search("How do I disable disk encryption on the laptops?")
    assert not res.serve and res.reason == "intent_mismatch"


async def test_scope_gate_veto_before_rerank(make_corpus):
    corpus, _ = rerank_corpus(make_corpus, FakeReranker(default=1.0))
    await corpus.deposit(DepositIn(query="S3 Standard storage price per GB", claim="$0.023",
                                   scope={"region": "us-east-1"}, volatility_hint="high"))
    res = await corpus.search("S3 Standard storage price per GB",
                              {"region": "eu-west-1"})
    assert not res.serve and res.reason == "no_match"   # gated out of the pool entirely


async def test_stale_confidence_still_deterministic_on_rerank_path(make_corpus):
    # the reranker replaces the MATCH judgment only: a matched-but-decayed
    # deposit still comes back "stale" from the untouched confidence pipeline.
    fake = FakeReranker(default=0.99)
    corpus, clk = rerank_corpus(make_corpus, fake)
    await corpus.deposit(DepositIn(query=Q_DEP, claim="3 years", volatility_hint="high"))
    clk.t += timedelta(days=14)
    res = await corpus.search(Q_ASK)
    assert not res.serve and res.outcome == "stale"


def test_facet_gate_toggle_in_intent_verdict():
    ex = agreement.RegexExtractor()
    when = ex.extract("What's the deadline to get CMMC compliant?")
    who = ex.extract("Who needs to comply with CMMC?")
    assert not agreement.intent_verdict(when, who).match            # gate on (default)
    assert agreement.intent_verdict(when, who, facet_gate=False).match  # reranker judges instead


async def test_fake_reranker_scores_are_positional():
    fake = FakeReranker({("q", "a"): 0.7}, default=0.2)
    assert fake.score("q", ["a", "b"]) == [0.7, 0.2]
    assert fake.score("q", []) == []


def test_apply_veto_zeroes_below_floor_only():
    from rrsrch.matching.rerank import apply_veto
    # candidate 2's veto score is under the floor → zeroed; others untouched
    assert apply_veto([0.9, 0.8, 0.7], [0.5, 0.05, 0.13], floor=0.13) == [0.9, 0.0, 0.7]
    assert apply_veto([], [], floor=0.13) == []
