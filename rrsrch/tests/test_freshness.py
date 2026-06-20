from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from rrsrch.freshness import decay as F

NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)


def test_decay_one_at_zero_and_clamped():
    assert F.decay(0, "low") == 1.0
    assert F.decay(-10, "high") == 1.0


def test_half_life_gives_half():
    for vol in ("low", "medium", "high"):
        assert F.decay(F.half_life_seconds(vol), vol) == pytest.approx(0.5)


def test_monotonic_decreasing():
    prev = 1.1
    for h in [0, 1, 6, 24, 72, 24 * 30]:
        cur = F.decay(h * 3600, "medium")
        assert cur < prev
        prev = cur


def test_low_over_months_medium_over_days_high_over_hours():
    # low: a week barely dents it; high: a day is long gone; medium: in between.
    assert F.decay(7 * 86400, "low") > 0.95
    assert F.decay(24 * 3600, "high") < 0.10
    assert 0.4 < F.decay(3 * 86400, "medium") < 0.6   # ~one half-life at 3d default


def test_should_serve_threshold():
    assert F.should_serve(0.5, 0.5) is True
    assert F.should_serve(0.4999, 0.5) is False


def test_freshness_uses_clock():
    c = F.freshness(NOW - timedelta(days=2), NOW, "high")
    assert c < 0.01  # high volatility, 2 days = many half-lives


def test_unknown_volatility_raises():
    with pytest.raises(ValueError):
        F.half_life_seconds("eternal")
