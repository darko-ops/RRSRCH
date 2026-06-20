from __future__ import annotations

import asyncio

from rrsrch import matching
from rrsrch.matching import scope_conflict
from rrsrch.schemas import DepositIn

run = asyncio.run


# --- scope gate (pure) ------------------------------------------------------
def test_scope_conflict_on_shared_key():
    assert scope_conflict({"region": "us-east-1"}, {"region": "eu-west-1"}) is True
    assert scope_conflict({"region": "us-east-1"}, {"region": "us-east-1"}) is False
    assert scope_conflict({"region": "us-east-1"}, {"version": "4"}) is False  # no shared key
    assert scope_conflict({}, {"region": "x"}) is False
    assert scope_conflict({"region": "US-EAST-1"}, {"region": "us-east-1 "}) is False  # normalized


# --- candidate retrieval ----------------------------------------------------
def test_similarity_floor_excludes_unrelated(make_corpus):
    corpus, _ = make_corpus()
    run(corpus.deposit(DepositIn(query="CMMC Level 2 assessment requirements", claim="...")))
    # An unrelated query should fall below the floor and return nothing.
    cands = run(matching.find_candidates(
        corpus.store, corpus.embedder, "best pizza in Naples", {},
        similarity_floor=corpus.settings.similarity_floor))
    assert cands == []


def test_scope_gate_rejects_conflicting_region(make_corpus):
    corpus, _ = make_corpus()
    run(corpus.deposit(DepositIn(
        query="S3 Standard storage price per GB", claim="$0.023",
        scope={"region": "us-east-1"}, volatility_hint="high")))
    # Same question, different region -> must NOT match despite high similarity.
    same_region = run(matching.find_candidates(
        corpus.store, corpus.embedder, "S3 Standard storage price per GB",
        {"region": "us-east-1"}, similarity_floor=corpus.settings.similarity_floor))
    other_region = run(matching.find_candidates(
        corpus.store, corpus.embedder, "S3 Standard storage price per GB",
        {"region": "eu-west-1"}, similarity_floor=corpus.settings.similarity_floor))
    assert len(same_region) == 1
    assert other_region == []  # scope gate fired


def test_paraphrase_matches(make_corpus):
    corpus, _ = make_corpus()
    run(corpus.deposit(DepositIn(query="CMMC Level 2 assessment requirements", claim="...")))
    cands = run(matching.find_candidates(
        corpus.store, corpus.embedder, "what does CMMC level 2 require for assessment?", {},
        similarity_floor=corpus.settings.similarity_floor))
    assert len(cands) == 1
    assert cands[0][1] >= corpus.settings.similarity_floor
