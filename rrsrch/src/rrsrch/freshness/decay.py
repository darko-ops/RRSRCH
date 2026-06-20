"""
Freshness — the DETERMINISTIC serve gate (Phase 0: the simple version only).

CORE PRINCIPLE: the serve-vs-re-search decision is deterministic code. No LLM
touches this. Phase 0 is age + volatility decay — nothing else. No corroboration,
no disagreement, no exploration loop (those are later phases; adding them here is
scope creep).

    confidence = decay(age, volatility) = 0.5 ** (age / half_life(volatility))
    serve      = confidence >= freshness_threshold
"""
from __future__ import annotations

from datetime import datetime

_HOUR = 3600.0
_DAY = 86_400.0

# Defaults mirror config; half_lives() lets the corpus pass tuned values in.
DEFAULT_HALF_LIFE_SECONDS: dict[str, float] = {
    "low": 180 * _DAY,   # months
    "medium": 3 * _DAY,  # days
    "high": 6 * _HOUR,   # hours
}
DEFAULT_FRESHNESS_THRESHOLD = 0.5
VALID_VOLATILITY = ("low", "medium", "high")


def half_life_seconds(volatility: str, table: dict[str, float] | None = None) -> float:
    t = table or DEFAULT_HALF_LIFE_SECONDS
    try:
        return t[volatility]
    except KeyError as exc:
        raise ValueError(f"unknown volatility {volatility!r}") from exc


def decay(age_seconds: float, volatility: str, table: dict[str, float] | None = None) -> float:
    """Confidence in (0, 1]. 1.0 at age 0; 0.5 at one half-life; monotonic down."""
    if age_seconds <= 0:
        return 1.0
    return 0.5 ** (age_seconds / half_life_seconds(volatility, table))


def freshness(created_at: datetime, now: datetime, volatility: str,
              table: dict[str, float] | None = None) -> float:
    return decay((now - created_at).total_seconds(), volatility, table)


def should_serve(confidence: float, threshold: float = DEFAULT_FRESHNESS_THRESHOLD) -> bool:
    return confidence >= threshold


def half_lives_from_settings(settings) -> dict[str, float]:
    return {
        "low": settings.half_life_low_days * _DAY,
        "medium": settings.half_life_medium_days * _DAY,
        "high": settings.half_life_high_hours * _HOUR,
    }
