"""Phase 3: attestation verification (deterministic, forged ≠ trusted), the
prior-composition rule (trusted faster, NOT a free pass), and the
attestation-aware vouch that breaks identical-lie collusion."""
from __future__ import annotations

from datetime import timedelta

import pytest

from rrsrch import confidence as C
from rrsrch.attestation import LocalAttestationVerifier, mint_token
from rrsrch.schemas import DepositIn
from tests.conftest import T0, offline_settings

S = offline_settings()
SECRET = S.attestation_secret


def tok(identity: str, level: float = 1.0, days: int = 30, secret: str = SECRET) -> str:
    return mint_token(identity, level, T0 + timedelta(days=days), secret)


# ------------------------------------------------ verification security

def test_valid_bound_token_verifies():
    v = LocalAttestationVerifier(SECRET)
    r = v.verify(tok("alice"), "alice", T0)
    assert r.verified and r.identity == "alice" and r.level == 1.0


def test_forged_expired_misbound_malformed_all_grant_nothing():
    v = LocalAttestationVerifier(SECRET)
    assert not v.verify(tok("alice", secret="wrong-secret"), "alice", T0).verified
    assert not v.verify(tok("alice", days=-1), "alice", T0).verified          # expired
    assert not v.verify(tok("alice"), "mallory", T0).verified                 # misbound
    assert not v.verify("garbage", "alice", T0).verified
    assert not v.verify(None, "alice", T0).verified
    # tampered level: signature covers it
    parts = tok("alice", 0.2).split(":")
    parts[2] = "1.0000"
    assert not v.verify(":".join(parts), "alice", T0).verified


async def test_forged_token_falls_back_to_unattested_trust(make_corpus):
    corpus, _ = make_corpus()
    await corpus.deposit(DepositIn(query="q1 about widgets", claim="c",
                                   depositor="mallory",
                                   attestation=tok("mallory", secret="forged")))
    assert await corpus.store.attested_level("mallory") is None   # nothing granted
    assert await corpus._trust("mallory") == pytest.approx(S.trust_prior_mean)


# ------------------------------------------- composition (design trap A)

def test_attested_prior_composition_is_bounded():
    assert C.attested_prior(0.85, 0.95, 0.0) == 0.85     # level 0 = unattested math
    assert C.attested_prior(0.85, 0.95, 1.0) == 0.95
    assert C.attested_prior(0.85, 0.95, 0.5) == pytest.approx(0.90)
    assert C.attested_prior(0.85, 0.95, 7.0) == 0.95     # clamped


async def test_attested_unknown_starts_higher_but_is_no_free_pass(make_corpus):
    corpus, _ = make_corpus()
    await corpus.deposit(DepositIn(query="attested agent q", claim="c",
                                   depositor="alice", attestation=tok("alice")))
    await corpus.deposit(DepositIn(query="unattested agent q", claim="c",
                                   depositor="bob"))
    a0 = await corpus._depositor_base("alice")
    b0 = await corpus._depositor_base("bob")
    assert a0 > b0 >= corpus.settings.confidence_threshold   # trusted faster

    # trap A: track record still moves — an attested liar sinks below serve
    for _ in range(3):
        await corpus._bump_trust("alice", contradicted=1)
        # (independent contradictions; using the internal bump keeps this a
        # unit test of the composition — the corroborate path is covered below)
    assert await corpus._depositor_base("alice") < corpus.settings.confidence_threshold


async def test_attested_liar_sinks_through_the_real_corroborate_path(make_corpus):
    corpus, _ = make_corpus()
    for i in range(3):
        rec = await corpus.deposit(DepositIn(
            query=f"attested fact {i} about the gizmo fleet",
            claim=f"bogus ${10 + i}", depositor="alice",
            attestation=tok("alice")))
        out = await corpus.corroborate(str(rec.id), f"actual ${70 + i}",
                                       depositor="rrsrch-verifier")
        assert out.outcome == "disagreed"
    assert await corpus._depositor_base("alice") < corpus.settings.confidence_threshold
    # future deposits from the attested-but-proven-bad identity start pre-muted
    dep = await corpus.deposit(DepositIn(query="what is the gizmo duty cycle?",
                                         claim="200 percent", depositor="alice",
                                         attestation=tok("alice")))
    out = await corpus.search("what is the gizmo duty cycle?")
    assert out.serve is False and out.deposit_id == str(dep.id)


# ------------------------------------- collusion (design trap B, the mechanism)

async def _ring_lie(corpus, k: int = 3, lie: str = "the quota is unlimited requests"):
    """K unattested sock-puppets: one deposits the identical lie, the others
    cross-corroborate it. Returns the lie deposit."""
    dep = await corpus.deposit(DepositIn(query="what is the daily API quota?",
                                         claim=lie, depositor="sock-0"))
    for i in range(1, k):
        out = await corpus.corroborate(str(dep.id), lie, depositor=f"sock-{i}")
        assert out.outcome == "agreed"
    return dep


async def test_collusion_ring_cannot_float_its_lie(make_corpus):
    """Phase 3 rules: N distinct-but-unattested identities agreeing are all WEAK
    vouches — the lie never gets the base-1.0 float, so once its authors are
    proven bad it stays muted no matter how many socks agree."""
    corpus, _ = make_corpus()
    await _crater(corpus, "sock-0")            # ring already proven bad
    dep = await _ring_lie(corpus)
    assert (await corpus.store.get(dep.id)).independent_corroboration_count == 0
    assert (await corpus.search("what is the daily API quota?")).serve is False

    # ...and an ATTESTED honest contradictor retires it and penalizes the author
    from rrsrch.attestation import mint_token as mt
    token = mt("auditor", 1.0, T0 + timedelta(days=30), SECRET)
    out = await corpus.corroborate(str(dep.id), "the quota is 10,000 requests per day",
                                   depositor="auditor", attestation=token)
    assert out.outcome == "disagreed"
    assert (await corpus.store.get(dep.id)).retired_at is not None


async def test_phase2_rules_comparison_the_ring_used_to_win(make_corpus):
    """A/B lever: with attested_vouch_required=False (Phase 2 rules), the same
    ring's cross-vouch floats the lie at base 1.0 EVEN with proven-bad authors —
    the exact gap attestation closes."""
    corpus, _ = make_corpus(attested_vouch_required=False)
    await _crater(corpus, "sock-0")
    dep = await _ring_lie(corpus)
    assert (await corpus.store.get(dep.id)).independent_corroboration_count > 0
    served = await corpus.search("what is the daily API quota?")
    assert served.serve is True and served.deposit_id == str(dep.id)   # Phase 2 gap


async def test_attested_self_vouch_is_still_blocked(make_corpus):
    """Attestation does not weaken independence: an attested author agreeing
    with itself is still SELF — no trust, no vouch."""
    corpus, _ = make_corpus()
    rec = await corpus.deposit(DepositIn(query="q about the fleet size",
                                         claim="42 units", depositor="alice",
                                         attestation=tok("alice")))
    await corpus.corroborate(str(rec.id), "42 units", depositor="alice",
                             attestation=tok("alice"))
    assert await corpus.store.depositor_counts("alice") == (0, 0)
    assert (await corpus.store.get(rec.id)).independent_corroboration_count == 0


from tests.test_trust import _crater  # noqa: E402  (shared crater helper)