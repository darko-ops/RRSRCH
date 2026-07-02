"""The self-verification worker: deterministic priority, fake provider, and the
explore/exploit coin in search()."""
from __future__ import annotations

from datetime import timedelta

from rrsrch.schemas import DepositIn
from rrsrch.verification import Verifier
from tests.conftest import FakeProvider, FixedRandom


async def test_verify_once_agreed_reearns_and_stamps(make_corpus):
    provider = FakeProvider(answers={
        "CMMC Level 2 assessment requirements":
            "CMMC Level 2 requires the 110 NIST 800-171 controls, assessed by a C3PAO."})
    corpus, clk = make_corpus(provider=provider)
    rec = await corpus.deposit(DepositIn(
        query="CMMC Level 2 assessment requirements",
        claim="The 110 controls of NIST 800-171 apply; a C3PAO runs the assessment.",
        volatility_hint="low"))
    clk.t += timedelta(days=10)

    reports = await Verifier(corpus, provider).verify_once()
    assert len(reports) == 1 and reports[0].outcome == "agreed"
    topic = await corpus.store.get_topic(rec.topic_id)
    assert topic.last_verified_at == clk.t
    assert topic.exploration_rate < corpus.settings.exploration_base_low  # decayed


async def test_verify_prioritizes_reset_topic_first(make_corpus):
    provider = FakeProvider(answer="an answer that certainly disagrees entirely")
    corpus, clk = make_corpus(provider=provider)
    a = await corpus.deposit(DepositIn(query="how to rotate IAM keys", claim="rotate them"))
    b = await corpus.deposit(DepositIn(query="pizza dough hydration", claim="65% water"))
    # disagreement on topic B resets its last_verified_at → max priority
    await corpus.corroborate(str(b.id), "80% water for high-hydration doughs")
    ta = await corpus.store.get_topic(a.topic_id)
    ta.last_verified_at = clk.t
    await corpus.store.upsert_topic(ta)

    reports = await Verifier(corpus, provider).verify_once(batch_size=1)
    assert reports[0].topic_id == b.topic_id  # the reset topic went first


async def test_search_explores_when_coin_says_so(make_corpus):
    # rng always under the rate → every would-serve hit explores
    provider = FakeProvider(
        answer="CMMC Level 2 requires the 110 NIST 800-171 controls, assessed by a C3PAO.")
    corpus, _ = make_corpus(provider=provider, rng=FixedRandom(0.0))
    await corpus.deposit(DepositIn(
        query="CMMC Level 2 assessment requirements",
        claim="110 controls of NIST 800-171; a C3PAO assesses.", volatility_hint="low"))
    out = await corpus.search("CMMC Level 2 assessment requirements")
    assert out.serve is True and out.outcome == "hit"
    assert provider.calls  # a fresh derivation actually ran
    stats = await corpus.store.event_stats()
    assert stats["by_outcome"].get("explore") == 1
    assert stats["by_outcome"].get("agreed") == 1


async def test_search_explore_disagreement_serves_the_fresh_claim(make_corpus):
    provider = FakeProvider(answer="$0.021 per GB-month is the current price")
    corpus, _ = make_corpus(provider=provider, rng=FixedRandom(0.0))
    old = await corpus.deposit(DepositIn(query="current S3 Standard price per GB",
                                         claim="$0.023 per GB-month", volatility_hint="high"))
    out = await corpus.search("current S3 Standard price per GB")
    assert out.serve is True and "$0.021" in out.claim
    assert out.deposit_id != str(old.id)          # the fresh deposit was served
    assert (await corpus.store.get(old.id)).retired_at is not None


async def test_search_never_explores_without_provider(make_corpus):
    corpus, _ = make_corpus(rng=FixedRandom(0.0))   # coin says explore, but no provider
    await corpus.deposit(DepositIn(query="q about rotating keys", claim="rotate them"))
    out = await corpus.search("q about rotating keys")
    assert out.serve is True
    stats = await corpus.store.event_stats()
    assert "explore" not in stats["by_outcome"]
