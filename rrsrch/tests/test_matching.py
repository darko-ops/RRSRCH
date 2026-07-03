from __future__ import annotations

from rrsrch.matching import engine
from rrsrch.schemas import DepositIn

KW = dict(k=20, vector_weight=0.7, lexical_weight=0.3)


async def test_paraphrase_ranks_above_threshold(make_corpus):
    corpus, _ = make_corpus()
    await corpus.deposit(DepositIn(query="CMMC Level 2 assessment requirements", claim="..."))
    ranked = await engine.rank(corpus.store, corpus.embedder,
                               "what does CMMC level 2 require for assessment?", None, **KW)
    assert ranked and ranked[0].similarity >= corpus.settings.similarity_threshold


async def test_unrelated_is_below_threshold(make_corpus):
    corpus, _ = make_corpus()
    await corpus.deposit(DepositIn(query="CMMC Level 2 assessment requirements", claim="..."))
    m = await engine.best_match(corpus.store, corpus.embedder, "best pizza in Naples", None,
                                threshold=corpus.settings.similarity_threshold, **KW)
    assert m is None


async def test_scope_gate_blocks_conflicting_region(make_corpus):
    corpus, _ = make_corpus()
    await corpus.deposit(DepositIn(query="S3 Standard storage price per GB", claim="$0.023",
                                   scope={"region": "us-east-1"}, volatility_hint="high"))
    same = await engine.rank(corpus.store, corpus.embedder, "S3 Standard storage price per GB",
                             {"region": "us-east-1"}, **KW)
    other = await engine.rank(corpus.store, corpus.embedder, "S3 Standard storage price per GB",
                              {"region": "eu-west-1"}, **KW)
    assert len(same) == 1 and same[0].record.scope == {"region": "us-east-1"}
    assert other == []  # hard gate fired before similarity


async def test_hybrid_uses_both_signals(make_corpus):
    corpus, _ = make_corpus()
    await corpus.deposit(DepositIn(query="how to rotate API keys safely", claim="..."))
    ranked = await engine.rank(corpus.store, corpus.embedder,
                               "rotating api keys securely", None, **KW)
    assert ranked
    assert ranked[0].vector > 0 and ranked[0].lexical > 0  # both retrievers contribute


async def test_retired_deposits_never_match(make_corpus):
    corpus, _ = make_corpus()
    rec = await corpus.deposit(DepositIn(query="how to rotate API keys safely", claim="old"))
    out = await corpus.corroborate(str(rec.id), "entirely new and different guidance")
    assert out.outcome == "disagreed"
    ranked = await engine.rank(corpus.store, corpus.embedder,
                               "how to rotate API keys safely", None, **KW)
    # only the successor is retrievable; the retired original is gone from the pool.
    assert [str(m.record.id) for m in ranked] == [out.new_deposit_id]
