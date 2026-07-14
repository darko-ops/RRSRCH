"""Measured vs estimated savings: a deposit that carries its real production
cost (derivation_tokens) makes later hits count MEASURED savings; deposits
without it stay estimate-based — and metrics reports the two separately."""
from __future__ import annotations

from datetime import timedelta

from rrsrch.schemas import DepositIn, Source

Q1 = "CMMC Level 2 assessment requirements"
C1 = ("CMMC Level 2 requires implementing the 110 security controls of NIST SP "
      "800-171 and, for most contractors, a triennial third-party assessment.")
Q2 = "current S3 Standard storage price per GB in us-east-1"
C2 = "$0.023 per GB-month for the first 50 TB."


async def test_measured_basis_hit(make_corpus):
    corpus, clk = make_corpus()
    await corpus.deposit(DepositIn(query=Q1, claim=C1, volatility_hint="low",
                                   sources=[Source(url="https://dodcio.defense.gov/cmmc/")],
                                   derivation_tokens=4800))   # measured research cost
    clk.t = clk.t + timedelta(days=1)
    out = await corpus.search(Q1)
    assert out.outcome == "hit"

    m = await corpus.metrics()
    assert m["hits_measured_basis"] == 1 and m["hits_estimated_basis"] == 0
    # measured saving = measured cost - served size: positive but << the 90k estimate
    assert 0 < m["tokens_saved_measured"] < 4800
    assert m["tokens_saved_measured"] == m["total_tokens_saved"]
    assert m["tokens_saved_estimated"] == 0

    feed = await corpus.recent(limit=1)
    assert feed[0]["outcome"] == "hit"


async def test_estimated_basis_without_measured_cost(make_corpus):
    corpus, clk = make_corpus()
    await corpus.deposit(DepositIn(query=Q1, claim=C1, volatility_hint="low"))
    clk.t = clk.t + timedelta(days=1)
    assert (await corpus.search(Q1)).outcome == "hit"

    m = await corpus.metrics()
    assert m["hits_measured_basis"] == 0 and m["hits_estimated_basis"] == 1
    assert m["tokens_saved_measured"] == 0
    assert m["tokens_saved_estimated"] == m["total_tokens_saved"] > 0


async def test_mixed_bases_split_cleanly(make_corpus):
    corpus, clk = make_corpus()
    await corpus.deposit(DepositIn(query=Q1, claim=C1, volatility_hint="low",
                                   derivation_tokens=5200))
    await corpus.deposit(DepositIn(query=Q2, claim=C2, volatility_hint="low"))
    clk.t = clk.t + timedelta(hours=6)
    assert (await corpus.search(Q1)).outcome == "hit"
    assert (await corpus.search(Q2)).outcome == "hit"

    m = await corpus.metrics()
    assert m["hits_measured_basis"] == 1 and m["hits_estimated_basis"] == 1
    assert m["tokens_saved_measured"] > 0
    assert m["tokens_saved_estimated"] > 0
    assert (m["tokens_saved_measured"] + m["tokens_saved_estimated"]
            == m["total_tokens_saved"])


async def test_correction_carries_measured_cost(make_corpus):
    """A disagreeing corroboration with a known research cost stamps the
    replacement deposit, so hits on the corrected answer are measured too."""
    corpus, clk = make_corpus()
    rec = await corpus.deposit(DepositIn(query=Q2, claim=C2, volatility_hint="low"))
    out = await corpus.corroborate(str(rec.id), "$0.021 per GB-month for the first 50 TB.",
                                   depositor="rrsrch-verify", derivation_tokens=3100)
    assert out.outcome == "disagreed"
    clk.t = clk.t + timedelta(hours=1)
    hit = await corpus.search(Q2)
    assert hit.outcome == "hit" and hit.deposit_id == out.new_deposit_id

    m = await corpus.metrics()
    assert m["hits_measured_basis"] == 1
    assert 0 < m["tokens_saved_measured"] < 3100
