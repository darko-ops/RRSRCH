"""The three worked examples from the spec, run end-to-end through the corpus with
a controllable clock. These are the acceptance tests: if these pass, Phase 0's
thesis (reuse works, savings are measurable, errors don't persist) holds."""
from __future__ import annotations

from datetime import timedelta

from rrsrch.schemas import DepositIn, Source

CMMC_Q = "CMMC Level 2 assessment requirements"
CMMC_CLAIM = ("CMMC Level 2 requires implementing the 110 security controls of NIST SP "
              "800-171 and, for most contractors, a triennial third-party assessment by a "
              "C3PAO; some programs allow self-assessment with annual affirmation.")


async def test_a_cold_miss_then_deposit(make_corpus):
    """A) COLD MISS: novel question → structured miss → agent researches → deposits."""
    corpus, _ = make_corpus()
    out = await corpus.search(CMMC_Q)
    assert out.serve is False and out.outcome == "miss" and out.reason == "no_match"

    rec = await corpus.deposit(DepositIn(
        query=CMMC_Q, claim=CMMC_CLAIM, volatility_hint="low",
        sources=[Source(url="https://dodcio.defense.gov/cmmc/")]))
    stored = await corpus.store.get(rec.id)
    assert stored is not None and stored.volatility == "low"

    # the cold miss was charged the full cold-path estimate in telemetry.
    m = await corpus.metrics()
    assert m["misses"] == 1
    assert m["tokens_with_rrsrch"] >= corpus.settings.cold_path_estimate_tokens


async def test_b_warm_hit_on_paraphrase_three_days_later(make_corpus):
    """B) WARM HIT: 3 days later, a paraphrase serves cheaply — the money test."""
    corpus, clk = make_corpus()
    await corpus.deposit(DepositIn(
        query=CMMC_Q, claim=CMMC_CLAIM, volatility_hint="low",
        sources=[Source(url="https://dodcio.defense.gov/cmmc/")]))

    clk.t = clk.t + timedelta(days=3)
    out = await corpus.search("what does CMMC level 2 require for assessment?")
    assert out.serve is True and out.outcome == "hit"
    assert out.similarity >= corpus.settings.similarity_threshold
    assert out.confidence >= 0.70          # low volatility barely decays in 3 days
    assert out.age_seconds == 3 * 86400    # controllable clock, not wall time

    m = await corpus.metrics()
    served = m["tokens_with_rrsrch"]
    cold = corpus.settings.cold_path_estimate_tokens
    assert m["total_tokens_saved"] >= cold - 2_000   # cold estimate minus tiny served size
    assert served < cold * 0.05                      # the hit cost pennies on the dollar


async def test_c_stale_correction_error_does_not_persist(make_corpus):
    """C) STALE CORRECTION: fast-decaying claim goes stale, disagreeing corroboration
    retires it, and searches return the corrected claim from then on."""
    corpus, clk = make_corpus()
    rec = await corpus.deposit(
        DepositIn(query="current S3 Standard storage price per GB", claim="$0.023 per GB-month",
                  volatility_hint="high", scope={"region": "us-east-1"}),
        created_at=clk.t - timedelta(days=60))

    stale = await corpus.search("current S3 Standard storage price per GB",
                                scope={"region": "us-east-1"})
    assert stale.serve is False and stale.outcome == "stale"
    assert stale.confidence is not None and stale.confidence < 0.70
    assert stale.deposit_id == str(rec.id)

    fixed = await corpus.corroborate(
        stale.deposit_id, "$0.021 per GB-month (reduced January 2026)",
        sources=[Source(url="https://aws.amazon.com/s3/pricing/")])
    assert fixed.outcome == "disagreed" and fixed.new_deposit_id is not None

    old = await corpus.store.get(rec.id)
    assert old.retired_at is not None and str(old.superseded_by) == fixed.new_deposit_id

    again = await corpus.search("current S3 Standard storage price per GB",
                                scope={"region": "us-east-1"})
    assert again.serve is True and again.deposit_id == fixed.new_deposit_id
    assert "$0.021" in again.claim   # the stale price never comes back
