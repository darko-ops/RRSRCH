"""Deterministic topic clustering: scope partitions hard, embeddings cluster by
leader-centroid cosine, and re-running the same deposits yields the same topics."""
from __future__ import annotations

from rrsrch.schemas import DepositIn
from rrsrch.topics import scope_key


def test_scope_key_is_canonical():
    assert scope_key(None) == "" == scope_key({})
    assert scope_key({"Region": " US-EAST-1 "}) == scope_key({"region": "us-east-1"})
    assert scope_key({"a": 1, "b": 2}) == scope_key({"b": 2, "a": 1})


async def test_same_question_paraphrases_share_a_topic(make_corpus):
    corpus, _ = make_corpus()
    a = await corpus.deposit(DepositIn(query="CMMC Level 2 assessment requirements", claim="x"))
    b = await corpus.deposit(DepositIn(query="what CMMC level 2 requires for assessment",
                                       claim="y"))
    assert a.topic_id is not None and a.topic_id == b.topic_id


async def test_different_subjects_get_different_topics(make_corpus):
    corpus, _ = make_corpus()
    a = await corpus.deposit(DepositIn(query="CMMC Level 2 assessment requirements", claim="x"))
    b = await corpus.deposit(DepositIn(query="best pizza dough hydration ratio", claim="y"))
    assert a.topic_id != b.topic_id


async def test_scope_partitions_topics_hard(make_corpus):
    corpus, _ = make_corpus()
    a = await corpus.deposit(DepositIn(query="S3 Standard price per GB", claim="x",
                                       scope={"region": "us-east-1"}))
    b = await corpus.deposit(DepositIn(query="S3 Standard price per GB", claim="y",
                                       scope={"region": "eu-west-1"}))
    assert a.topic_id != b.topic_id  # identical text, conflicting scope → separate arms


async def test_assignment_is_deterministic_across_reruns(make_corpus):
    queries = ["CMMC Level 2 assessment requirements",
               "what CMMC level 2 requires for assessment",
               "best pizza dough hydration ratio"]
    runs = []
    for _ in range(2):   # fresh corpus, same deposits, same order
        corpus, _ = make_corpus()
        runs.append([(await corpus.deposit(DepositIn(query=q, claim="c"))).topic_id
                     for q in queries])
    assert runs[0] == runs[1]  # content-derived ids: identical on re-run


async def test_new_topic_seeds_exploration_rate_from_hint(make_corpus):
    corpus, _ = make_corpus()
    rec = await corpus.deposit(DepositIn(query="current spot price of DDR5 RAM",
                                         claim="c", volatility_hint="high"))
    topic = await corpus.store.get_topic(rec.topic_id)
    assert topic is not None
    assert topic.exploration_rate == corpus.settings.exploration_base_high
    assert topic.base_volatility == "high" and topic.half_life_factor == 1.0
