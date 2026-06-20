"""The three worked examples — the spec's acceptance criteria, and the demo.
Run on the offline pair with a controllable clock so age is simulated, not waited."""
from __future__ import annotations

import asyncio
from datetime import timedelta

from rrsrch.schemas import DepositIn

run = asyncio.run

CMMC_Q = "CMMC Level 2 assessment requirements"
CMMC_PARAPHRASE = "what does CMMC level 2 require for assessment?"
CMMC_CLAIM = "CMMC Level 2 aligns to NIST SP 800-171's 110 controls; assessed by a C3PAO every 3 years."


def test_example_A_cold_miss_then_deposit(make_corpus):
    corpus, _ = make_corpus()
    miss = run(corpus.search(CMMC_Q))
    assert miss.outcome == "miss"

    rec = run(corpus.deposit(DepositIn(query=CMMC_Q, claim=CMMC_CLAIM, volatility_hint="low")))
    assert rec.base_confidence == 0.80
    assert rec.volatility == "low"


def test_example_B_warm_hit_three_days_later(make_corpus):
    corpus, clk = make_corpus()
    run(corpus.deposit(DepositIn(query=CMMC_Q, claim=CMMC_CLAIM, volatility_hint="low")))

    clk.t = clk.t + timedelta(days=3)  # a different agent, 3 days later
    out = run(corpus.search(CMMC_PARAPHRASE))           # a PARAPHRASE
    assert out.outcome == "hit"
    assert out.confidence >= 0.70                        # low-volatility barely decays
    assert out.similarity >= corpus.settings.similarity_floor
    assert "C3PAO" in out.claim

    rep = run(corpus.savings_report())                  # the money number
    assert rep["hits"] == 1
    assert rep["total_tokens_saved"] > 80_000           # cold path minus a tiny served answer


def test_example_C_stale_answer_caught_and_corrected(make_corpus):
    corpus, clk = make_corpus()
    Q = "current S3 Standard price per GB"
    old_claim = "AWS S3 Standard storage is priced at $0.023 per GB per month in us-east-1."
    fresh_claim = "Effective 2026 the Standard tier rate rose; it is now roughly three cents per gigabyte monthly."

    old = run(corpus.deposit(DepositIn(query=Q, claim=old_claim, volatility_hint="high")))

    clk.t = clk.t + timedelta(days=60)                  # high-volatility => long stale
    stale = run(corpus.search(Q))
    assert stale.outcome == "stale"
    assert stale.confidence < 0.70

    res = run(corpus.corroborate(Q, fresh_claim))       # fresh search disagrees
    assert res["result"] == "disagreed"
    assert res["new_deposit_id"] != res["deposit_id"]

    # the old deposit was retired + superseded; the error must not persist.
    old_row = run(corpus.store.get_deposit(old.id))
    assert old_row.retired is True
    assert str(old_row.superseded_by) == res["new_deposit_id"]

    # a subsequent search now returns the CORRECTED (fresh) claim, cheaply.
    after = run(corpus.search(Q))
    assert after.outcome == "hit"
    assert "three cents" in after.claim
    assert old_claim not in (after.claim or "")
