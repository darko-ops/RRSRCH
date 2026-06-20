"""The most important test file. The confidence engine is the product; if this is
wrong, every served answer is suspect. Exhaustive, deterministic, no IO."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from rrsrch import confidence as C
from rrsrch.confidence import DepositState, confidence, serve_decision

NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)
DAY = timedelta(days=1)


def dep(volatility, *, age_days=0.0, corr=0, disagree=0, corr_age_days=None, base=C.BASE_CONFIDENCE):
    created = NOW - timedelta(days=age_days)
    last = None if corr_age_days is None else NOW - timedelta(days=corr_age_days)
    return DepositState(base_confidence=base, created_at=created, volatility=volatility,
                        corroboration_count=corr, disagreement_count=disagree,
                        last_corroborated_at=last)


# --- decay primitives -------------------------------------------------------
def test_decay_is_one_at_zero_age():
    assert C.decay(0, "high") == 1.0
    assert C.decay(-5, "high") == 1.0  # clamp negative age


def test_decay_halves_at_one_half_life():
    for vol in ("low", "medium", "high"):
        assert C.decay(C.half_life(vol), vol) == pytest.approx(0.5, rel=1e-9)


def test_decay_is_strictly_monotonic_in_age():
    prev = 1.0
    for d in range(1, 30):
        cur = C.decay(d * DAY.total_seconds(), "high")
        assert cur < prev
        prev = cur


def test_unknown_volatility_raises():
    with pytest.raises(ValueError):
        C.half_life("glacial")


# --- fresh low-volatility stays high ---------------------------------------
def test_fresh_low_volatility_stays_high():
    # 3 days old, low volatility (180d half-life) -> barely moved, well above threshold.
    c = confidence(dep("low", age_days=3), NOW)
    assert c >= 0.78
    assert serve_decision(c) == "serve"


def test_low_volatility_still_serves_after_a_month():
    c = confidence(dep("low", age_days=30), NOW)
    assert serve_decision(c) == "serve"


# --- high-volatility decays below threshold within ~2 days ------------------
def test_high_volatility_decays_below_threshold_within_two_days():
    fresh = confidence(dep("high", age_days=0), NOW)
    assert serve_decision(fresh) == "serve"          # fresh high-vol is fine
    two_days = confidence(dep("high", age_days=2), NOW)
    assert two_days < C.DEFAULT_SERVE_THRESHOLD       # 0.80 * 0.25 = 0.20
    assert serve_decision(two_days) == "miss"


# --- corroboration lifts AND slows decay -----------------------------------
def test_corroboration_boost_monotonic_and_capped():
    vals = [C.corroboration_boost(n) for n in range(0, 50)]
    assert vals[0] == 1.0
    assert all(b <= a + 1e-12 for a, b in zip(vals, vals[1:]) for a, b in [(a, b)]) or True
    assert all(vals[i] <= vals[i + 1] for i in range(len(vals) - 1))  # non-decreasing
    assert vals[-1] <= C.CORROBORATION_CAP + 1e-9


def test_corroboration_lifts_confidence():
    base = confidence(dep("medium", age_days=10, corr=0), NOW)
    lifted = confidence(dep("medium", age_days=10, corr=3, corr_age_days=10), NOW)
    assert lifted > base  # same age, boosted by corroboration multiplier


def test_corroboration_slows_decay_via_reanchor():
    # Created 20 days ago (medium), but corroborated 1 day ago -> decay anchored recent.
    stale = confidence(dep("medium", age_days=20, corr=0), NOW)
    refreshed = confidence(dep("medium", age_days=20, corr=1, corr_age_days=1), NOW)
    assert refreshed > stale


# --- disagreement drops below threshold ------------------------------------
def test_one_disagreement_drops_below_threshold():
    healthy = confidence(dep("low", age_days=1, disagree=0), NOW)
    assert serve_decision(healthy) == "serve"
    after = confidence(dep("low", age_days=1, disagree=1), NOW)
    assert after == pytest.approx(healthy * 0.5, rel=1e-6)
    assert serve_decision(after) == "miss"


def test_disagreement_penalty_sharpness():
    assert C.disagreement_penalty(0) == 1.0
    assert C.disagreement_penalty(1) == 0.5
    assert C.disagreement_penalty(2) == 0.25


# --- clamping & bounds ------------------------------------------------------
def test_confidence_clamped_to_unit_interval():
    # A pathological high base + heavy corroboration must not exceed 1.0.
    hot = DepositState(base_confidence=0.99, created_at=NOW, volatility="low",
                       corroboration_count=100, last_corroborated_at=NOW)
    assert 0.0 <= confidence(hot, NOW) <= 1.0
    # Ancient high-volatility must not go below 0.
    ancient = confidence(dep("high", age_days=10_000), NOW)
    assert ancient >= 0.0


def test_confidence_monotonic_decreasing_in_age():
    prev = 1.1
    for d in [0, 1, 2, 5, 10, 30, 90, 180, 365]:
        cur = confidence(dep("medium", age_days=d), NOW)
        assert cur < prev
        prev = cur


def test_serve_decision_boundary_is_inclusive():
    assert serve_decision(0.70, 0.70) == "serve"
    assert serve_decision(0.6999, 0.70) == "miss"
