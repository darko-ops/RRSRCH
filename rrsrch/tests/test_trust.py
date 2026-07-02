"""Trust-by-track-record: the pure curve, the independence (Sybil) guard, and
poison containment — proven against the real corpus, not asserted."""
from __future__ import annotations

from datetime import timedelta

import pytest

from rrsrch import confidence as C
from rrsrch.schemas import DepositIn
from tests.conftest import offline_settings

S = offline_settings()


# ------------------------------------------------------- the pure curve

def trust(a: int, c: int) -> float:
    return C.trust_score(a, c, S.trust_prior_mean, S.trust_prior_strength)


def base(t: float) -> float:
    return C.trust_base(t, S.trust_prior_mean, S.trust_base_at_prior, S.trust_sub_slope)


def test_unknown_lands_at_the_prior_and_serves():
    assert trust(0, 0) == pytest.approx(S.trust_prior_mean)
    assert S.confidence_threshold < base(trust(0, 0)) < 1.0   # serviceable, not full


def test_proven_good_climbs_toward_full_base():
    t10 = trust(10, 0)
    assert t10 > S.trust_prior_mean
    assert base(t10) > base(trust(0, 0))
    assert base(trust(200, 0)) == pytest.approx(1.0, abs=0.01)


def test_proven_bad_sinks_below_serve_within_two_contradictions():
    assert base(trust(0, 1)) >= S.confidence_threshold      # one strike ≠ malice
    assert base(trust(0, 2)) < S.confidence_threshold       # two strikes: muted
    assert base(trust(0, 10)) < base(trust(0, 2))           # keeps sinking, bounded
    assert base(trust(0, 100)) >= 0.0


def test_trust_is_bounded_and_monotonic():
    prev = 0.0
    for a in range(0, 50, 5):
        t = trust(a, 0)
        assert 0.0 < t < 1.0 and t >= prev
        prev = t


def test_confidence_scales_with_base():
    from datetime import datetime, timezone
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    full = C.confidence(t0, None, t0, "low", base=1.0)
    muted = C.confidence(t0, None, t0, "low", base=0.6)
    assert full == 1.0 and muted == 0.6                     # base IS confidence at anchor


# ---------------------------------------- independence: the Sybil guard

async def test_self_corroboration_grants_no_trust(make_corpus):
    corpus, _ = make_corpus()
    rec = await corpus.deposit(DepositIn(query="q about the S3 price",
                                         claim="$0.023", depositor="mallory"))
    for _ in range(10):   # a malicious agent hammering its own deposit
        out = await corpus.corroborate(str(rec.id), "$0.023", depositor="mallory")
        assert out.outcome == "agreed"
    assert await corpus.store.depositor_counts("mallory") == (0, 0)   # NOTHING gained
    stored = await corpus.store.get(rec.id)
    assert stored.independent_corroboration_count == 0                # not vouched


async def test_independent_corroboration_does_move_trust(make_corpus):
    corpus, _ = make_corpus()
    rec = await corpus.deposit(DepositIn(query="q about the S3 price",
                                         claim="$0.023", depositor="alice"))
    await corpus.corroborate(str(rec.id), "$0.023", depositor="bob")
    assert await corpus.store.depositor_counts("alice") == (1, 0)
    # Phase 3: bob is UNATTESTED, so his agreement moves track record but is a
    # WEAK vouch — it does not set the base-1.0 float (the collusion breaker).
    assert (await corpus.store.get(rec.id)).independent_corroboration_count == 0
    # ...and bob earned nothing for corroborating (only AUTHORS are scored)
    assert await corpus.store.depositor_counts("bob") == (0, 0)


async def test_aged_out_contradiction_is_world_churn_not_penalty(make_corpus):
    """A claim that OUTLIVED its half-life before being contradicted aged out —
    the correction happens, the author's record doesn't suffer. Without this,
    prolific honest depositors ratchet downward every time reality moves."""
    corpus, clk = make_corpus()
    rec = await corpus.deposit(DepositIn(query="current spot price of the gizmo",
                                         claim="$10 per gizmo", depositor="alice",
                                         volatility_hint="high"))   # 6h half-life
    clk.t += timedelta(days=3)                     # far past the half-life
    out = await corpus.corroborate(str(rec.id), "$25 per gizmo", depositor="bob")
    assert out.outcome == "disagreed"              # corpus corrected...
    assert (await corpus.store.get(rec.id)).retired_at is not None
    assert await corpus.store.depositor_counts("alice") == (0, 0)   # ...no penalty

    # but a YOUNG wrong claim (inside its half-life) does cost its author
    rec2 = await corpus.deposit(DepositIn(query="current spot price of the widget",
                                          claim="$10 per widget", depositor="alice",
                                          volatility_hint="high"))
    clk.t += timedelta(hours=1)
    await corpus.corroborate(str(rec2.id), "$99 per widget", depositor="bob")
    assert await corpus.store.depositor_counts("alice") == (0, 1)


async def test_self_correction_is_not_penalized(make_corpus):
    corpus, _ = make_corpus()
    rec = await corpus.deposit(DepositIn(query="the current S3 price per GB",
                                         claim="$0.023", depositor="alice"))
    out = await corpus.corroborate(str(rec.id), "$0.019 after the cut",
                                   depositor="alice")
    assert out.outcome == "disagreed"                       # correction happens
    assert await corpus.store.depositor_counts("alice") == (0, 0)   # no penalty


# -------------------- Part 0: the cardinality polarity trust-guard

async def test_multiclause_paraphrase_contradiction_does_not_dock_trust(make_corpus):
    """Two honest wordings that segment into different clause counts can
    polarity_mismatch on cardinality alone — the deposit is retired-and-replaced
    (conservative), but the author is NOT penalized for a wording difference."""
    corpus, _ = make_corpus()
    rec = await corpus.deposit(DepositIn(
        query="are backups mandated at compliance level one",
        claim="Backups are not mandated", depositor="alice"))
    out = await corpus.corroborate(
        str(rec.id), "Encryption is required but backups are not mandated",
        depositor="bob")
    assert out.outcome == "disagreed" and out.rule == "polarity_mismatch"
    assert (await corpus.store.get(rec.id)).retired_at is not None   # still corrected
    assert await corpus.store.depositor_counts("alice") == (0, 0)    # NOT docked


async def test_clean_singleton_flip_still_docks_trust(make_corpus):
    corpus, _ = make_corpus()
    rec = await corpus.deposit(DepositIn(
        query="are backups mandated at compliance level one",
        claim="Backups are not mandated", depositor="alice"))
    out = await corpus.corroborate(str(rec.id), "Backups are mandated",
                                   depositor="bob")
    assert out.outcome == "disagreed" and out.rule == "polarity_mismatch"
    assert await corpus.store.depositor_counts("alice") == (0, 1)    # real flip: docked


# --------------------------------------------------- poison containment

async def _crater(corpus, depositor: str, n: int = 3) -> None:
    """Give `depositor` a track record of n independent contradictions."""
    for i in range(n):
        rec = await corpus.deposit(DepositIn(
            query=f"fact number {i} about the {depositor} widget line",
            claim=f"bogus figure ${40 + i}", depositor=depositor))
        await corpus.corroborate(str(rec.id), f"correct figure ${90 + i}",
                                 depositor="rrsrch-verifier")


async def test_proven_bad_lone_deposit_never_serves(make_corpus):
    corpus, _ = make_corpus()
    await _crater(corpus, "mallory")
    a, c = await corpus.store.depositor_counts("mallory")
    assert c >= 2                                            # proven bad

    poison = await corpus.deposit(DepositIn(query="what is the daily API quota?",
                                            claim="unlimited requests",
                                            depositor="mallory"))
    out = await corpus.search("what is the daily API quota?")
    assert out.serve is False                                # fresh, similar — still muted
    assert out.outcome == "stale" and out.deposit_id == str(poison.id)

    # self-corroboration cannot float it (anchor re-earn is standing-gated)
    for _ in range(5):
        await corpus.corroborate(str(poison.id), "unlimited requests",
                                 depositor="mallory")
    assert (await corpus.search("what is the daily API quota?")).serve is False


async def test_attested_voucher_floats_a_muted_deposit(make_corpus):
    from datetime import timedelta

    from rrsrch.attestation import mint_token

    corpus, clk = make_corpus()
    await _crater(corpus, "mallory")
    dep = await corpus.deposit(DepositIn(query="what is the daily API quota?",
                                         claim="10,000 requests per day",
                                         depositor="mallory"))
    assert (await corpus.search("what is the daily API quota?")).serve is False

    # Phase 3: an UNATTESTED independent agreement is a weak vouch — it cannot
    # float the muted deposit (N sock-puppets can't manufacture this)...
    weak = await corpus.corroborate(str(dep.id), "10,000 requests per day",
                                    depositor="unattested-agent")
    assert weak.outcome == "agreed"
    assert (await corpus.search("what is the daily API quota?")).serve is False

    # ...but a VERIFIED, distinct ATTESTED identity vouches it over the line.
    token = mint_token("honest-agent", 1.0, clk.t + timedelta(days=30),
                       corpus.settings.attestation_secret)
    out = await corpus.corroborate(str(dep.id), "10,000 requests per day",
                                   depositor="honest-agent", attestation=token)
    assert out.outcome == "agreed" and out.confidence == 1.0
    served = await corpus.search("what is the daily API quota?")
    assert served.serve is True and served.deposit_id == str(dep.id)


async def test_low_trust_contradictor_cannot_grief_or_supersede(make_corpus):
    """The grief guard: a proven-bad agent disagree-corroborating an honest
    deposit gets a recorded DISPUTE — no retirement, no penalty to the honest
    author, and the honest claim keeps serving."""
    corpus, _ = make_corpus()
    await _crater(corpus, "mallory")                 # mallory is proven bad
    dep = await corpus.deposit(DepositIn(query="current widget price per unit",
                                         claim="$50 per unit", depositor="alice"))
    out = await corpus.corroborate(str(dep.id), "$5 per unit", depositor="mallory")
    assert out.outcome == "disputed"                 # recorded, not enacted
    assert (await corpus.store.get(dep.id)).retired_at is None
    assert await corpus.store.depositor_counts("alice") == (0, 0)   # no grief
    served = await corpus.search("current widget price per unit")
    assert served.serve is True and "$50" in served.claim


async def test_contradicting_poison_penalizes_and_corrects(make_corpus):
    corpus, _ = make_corpus()
    poison = await corpus.deposit(DepositIn(query="current widget price per unit",
                                            claim="$5 per unit", depositor="mallory"))
    out = await corpus.corroborate(str(poison.id), "$50 per unit",
                                   depositor="honest-agent")
    assert out.outcome == "disagreed"
    assert (await corpus.store.get(poison.id)).retired_at is not None   # corrected
    assert await corpus.store.depositor_counts("mallory") == (0, 1)     # penalized
    served = await corpus.search("current widget price per unit")
    assert served.serve is True and "$50" in served.claim