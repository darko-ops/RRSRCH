"""The trust engine gets the hardest tests — it IS the product's safety property.
Everything here is pure and deterministic: no store, no LLM, no async."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from rrsrch import confidence as C

NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)


def test_decay_one_at_zero_and_clamped():
    assert C.decay(0, "low") == 1.0
    assert C.decay(-10, "high") == 1.0


def test_half_life_gives_half():
    for vol in ("low", "medium", "high"):
        assert C.decay(C.half_life_seconds(vol), vol) == pytest.approx(0.5)


def test_monotonic_decreasing():
    prev = 1.1
    for h in [0, 1, 6, 24, 72, 24 * 30]:
        cur = C.decay(h * 3600, "medium")
        assert cur < prev
        prev = cur


def test_low_over_months_medium_over_days_high_over_hours():
    # low: a week barely dents it; high: a day is long gone; medium: in between.
    assert C.decay(7 * 86400, "low") > 0.95
    assert C.decay(24 * 3600, "high") < 0.10
    assert 0.4 < C.decay(3 * 86400, "medium") < 0.6   # ~one half-life at 3d default


def test_should_serve_threshold():
    assert C.should_serve(0.70, 0.70) is True
    assert C.should_serve(0.6999, 0.70) is False


def test_confidence_uses_clock():
    c = C.confidence(NOW - timedelta(days=2), None, NOW, "high")
    assert c < 0.01  # high volatility, 2 days = many half-lives


def test_corroboration_reearns_confidence():
    created = NOW - timedelta(days=60)
    # 60 days old, high volatility: dead without corroboration...
    assert C.confidence(created, None, NOW, "high") < 0.001
    # ...but corroborated an hour ago, the anchor moves: confidence is fresh again.
    corroborated = NOW - timedelta(hours=1)
    c = C.confidence(created, corroborated, NOW, "high")
    assert c == pytest.approx(C.decay(3600, "high"))
    assert c > 0.85


def test_corroboration_before_creation_is_ignored():
    created = NOW - timedelta(days=1)
    bogus = NOW - timedelta(days=30)  # stamped before the deposit existed
    assert C.confidence(created, bogus, NOW, "medium") == pytest.approx(
        C.confidence(created, None, NOW, "medium"))


def test_default_threshold_is_070():
    assert C.DEFAULT_CONFIDENCE_THRESHOLD == 0.70


def test_unknown_volatility_raises():
    with pytest.raises(ValueError):
        C.half_life_seconds("eternal")
