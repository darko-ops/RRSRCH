from __future__ import annotations

from datetime import timedelta

from rrsrch.schemas import DepositIn, Source


async def test_deposit_then_warm_hit(make_corpus):
    corpus, _ = make_corpus()
    await corpus.deposit(DepositIn(
        query="CMMC Level 2 assessment requirements",
        claim="110 NIST 800-171 controls; assessed by a C3PAO.", volatility_hint="low"))
    out = await corpus.search("what does CMMC level 2 require for assessment?")
    assert out.serve is True and out.outcome == "hit"
    assert "C3PAO" in out.claim
    assert out.confidence >= 0.70 and out.similarity >= corpus.settings.similarity_threshold


async def test_cold_miss_returns_structured_miss(make_corpus):
    corpus, _ = make_corpus()
    out = await corpus.search("anything not in the corpus")
    assert out.serve is False and out.outcome == "miss" and out.reason == "no_match"


async def test_scope_mismatch_is_a_miss_not_a_false_hit(make_corpus):
    corpus, _ = make_corpus()
    await corpus.deposit(DepositIn(query="S3 Standard price per GB", claim="$0.023",
                                   scope={"region": "us-east-1"}, volatility_hint="medium"))
    out = await corpus.search("S3 Standard price per GB", scope={"region": "eu-west-1"})
    assert out.serve is False  # different region must never be served


async def test_stale_high_volatility_is_stale_not_miss(make_corpus):
    corpus, clk = make_corpus()
    rec = await corpus.deposit(DepositIn(query="current S3 Standard price per GB",
                                         claim="$0.023", volatility_hint="high"))
    clk.t = clk.t + timedelta(days=2)
    out = await corpus.search("current S3 Standard price per GB")
    assert out.serve is False and out.outcome == "stale"
    assert out.reason == "confidence_below_threshold"
    assert out.confidence is not None and out.confidence < corpus.settings.confidence_threshold
    assert out.deposit_id == str(rec.id)  # caller can corroborate() this exact deposit


async def test_corroborate_agreed_reearns_confidence(make_corpus):
    corpus, clk = make_corpus()
    rec = await corpus.deposit(DepositIn(query="current S3 Standard price per GB",
                                         claim="$0.023 per GB-month", volatility_hint="high"))
    clk.t = clk.t + timedelta(days=2)
    assert (await corpus.search("current S3 Standard price per GB")).outcome == "stale"

    out = await corpus.corroborate(str(rec.id), "$0.023 per GB-month",
                                   sources=[Source(url="https://aws.amazon.com/s3/pricing/")])
    assert out.outcome == "agreed" and out.confidence == 1.0

    served = await corpus.search("current S3 Standard price per GB")
    assert served.serve is True and served.outcome == "hit"   # trust re-earned
    stored = await corpus.store.get(rec.id)
    assert stored.corroboration_count == 1
    assert any("aws.amazon.com" in s["url"] for s in stored.sources)  # sources merged


async def test_corroborate_disagreed_supersedes(make_corpus):
    corpus, clk = make_corpus()
    rec = await corpus.deposit(DepositIn(query="current S3 Standard price per GB",
                                         claim="$0.023 per GB-month", volatility_hint="high"))
    clk.t = clk.t + timedelta(days=60)
    out = await corpus.corroborate(str(rec.id), "$0.021 per GB-month (price dropped Jan 2026)")
    assert out.outcome == "disagreed" and out.new_deposit_id is not None

    old = await corpus.store.get(rec.id)
    assert old.retired_at is not None and str(old.superseded_by) == out.new_deposit_id

    served = await corpus.search("current S3 Standard price per GB")
    assert served.serve is True and served.deposit_id == out.new_deposit_id
    assert "$0.021" in served.claim  # the error did not persist


async def test_corroborate_not_found_and_retired(make_corpus):
    corpus, _ = make_corpus()
    from uuid import uuid4
    missing = await corpus.corroborate(str(uuid4()), "whatever")
    assert missing.outcome == "not_found"

    rec = await corpus.deposit(DepositIn(query="q about x", claim="old answer"))
    replaced = await corpus.corroborate(str(rec.id), "completely different new answer")
    assert replaced.outcome == "disagreed"
    again = await corpus.corroborate(str(rec.id), "anything")
    assert again.outcome == "retired" and again.superseded_by == replaced.new_deposit_id


async def test_metrics_record_savings(make_corpus):
    corpus, _ = make_corpus()
    await corpus.deposit(DepositIn(query="CMMC Level 2 assessment requirements",
                                   claim="110 controls; C3PAO.", volatility_hint="low"))
    await corpus.search("what does CMMC level 2 require for assessment?")  # hit
    await corpus.search("totally unrelated")                               # miss
    m = await corpus.metrics()
    assert m["total_queries"] == 2 and m["hits"] == 1 and m["hit_rate"] == 0.5
    assert m["total_tokens_saved"] > 80_000
