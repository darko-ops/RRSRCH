"""The bandit rules are pure — test them hard, no store, no async."""
from __future__ import annotations

import pytest

from rrsrch import exploration as X
from tests.conftest import FixedRandom, offline_settings

S = offline_settings()


def test_seed_rate_follows_volatility_prior():
    assert (X.seed_rate("low", S) < X.seed_rate("medium", S) < X.seed_rate("high", S))
    with pytest.raises(ValueError):
        X.seed_rate("eternal", S)


def test_agreement_decays_toward_floor():
    r = S.exploration_base_medium
    for _ in range(200):
        r = X.rate_on_agreement(r, S)
    assert r == S.exploration_floor


def test_disagreement_grows_toward_ceiling():
    r = S.exploration_base_low
    for _ in range(200):
        r = X.rate_on_disagreement(r, S)
    assert r == S.exploration_ceiling


def test_half_life_factor_bounded_both_ways():
    f = 1.0
    for _ in range(50):
        f = X.half_life_factor_on_agreement(f, S)
    assert f == S.half_life_factor_max
    for _ in range(50):
        f = X.half_life_factor_on_disagreement(f, S)
    assert f == S.half_life_factor_min


def test_observed_volatility_needs_evidence_then_overrides():
    # thin evidence → None (the hint stands)
    assert X.observed_volatility(2, 1, S) is None
    # enough observations → the disagreement rate decides
    assert X.observed_volatility(10, 0, S) == "low"
    assert X.observed_volatility(8, 1, S) == "medium"      # 11% ≥ medium cutoff
    assert X.observed_volatility(5, 5, S) == "high"        # 50% ≥ high cutoff


def test_verification_priority_is_age_times_rate():
    assert X.verification_priority(1000.0, 0.5) == 500.0
    assert X.verification_priority(-5.0, 0.5) == 0.0
    # settled (low rate) needs much more age to reach the same priority
    assert X.verification_priority(86400, 0.01) < X.verification_priority(86400, 0.5)


def test_should_explore_uses_injected_rng():
    assert X.should_explore(FixedRandom(0.0), 0.01) is True     # always under rate
    assert X.should_explore(FixedRandom(0.999), 0.5) is False   # always over rate
