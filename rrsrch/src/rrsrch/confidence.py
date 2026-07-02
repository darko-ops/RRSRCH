"""Confidence — the DETERMINISTIC trust engine.

=============================================================================
THE INVIOLABLE RULE: the confidence score and the serve-vs-miss decision are
DETERMINISTIC CODE. An LLM may help with fuzzy, recoverable tasks (judging if
two questions are similar, distilling sources into a claim) but MUST NEVER
compute confidence or decide whether something is trustworthy. This module is
pure, separately tested, and imports no LLM, no network, no store. Keep it
that way.
=============================================================================

Model (Phase 0):

    anchor     = last_corroborated_at or created_at     # corroboration re-earns trust
    confidence = 0.5 ** (age_since_anchor / half_life(volatility))
    serve      = confidence >= confidence_threshold

Confidence decays with age at a rate set by topic volatility, and is re-earned
by corroboration: an agreeing corroboration moves the anchor to `now`, resetting
confidence to 1.0. A disagreeing corroboration retires the deposit entirely
(handled in corpus.py — also deterministic code).
"""
from __future__ import annotations

from datetime import datetime

_HOUR = 3600.0
_DAY = 86_400.0

# Defaults mirror config; half_lives_from_settings() lets the corpus pass tuned values.
DEFAULT_HALF_LIFE_SECONDS: dict[str, float] = {
    "low": 180 * _DAY,   # months
    "medium": 3 * _DAY,  # days
    "high": 6 * _HOUR,   # hours
}
DEFAULT_CONFIDENCE_THRESHOLD = 0.70
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


def confidence(
    created_at: datetime,
    last_corroborated_at: datetime | None,
    now: datetime,
    volatility: str,
    table: dict[str, float] | None = None,
    half_life_factor: float = 1.0,
) -> float:
    """Live confidence: decay from the most recent moment the claim was confirmed.

    Corroboration re-earns confidence by moving the anchor forward — an agreeing
    corroboration at time T makes confidence 1.0 at T, decaying afresh from there.

    `half_life_factor` is the topic-level bandit adjustment (Phase 1): a settled
    topic earns a factor > 1 (slower decay); a disagreeing topic earns < 1
    (faster decay). Deterministic code computes the factor — never an LLM.
    """
    anchor = last_corroborated_at or created_at
    if last_corroborated_at is not None and last_corroborated_at < created_at:
        anchor = created_at  # never trust a corroboration stamped before creation
    age = (now - anchor).total_seconds()
    if age <= 0:
        return 1.0
    return 0.5 ** (age / (half_life_seconds(volatility, table) * half_life_factor))


def should_serve(conf: float, threshold: float = DEFAULT_CONFIDENCE_THRESHOLD) -> bool:
    return conf >= threshold


def half_lives_from_settings(settings) -> dict[str, float]:
    return {
        "low": settings.half_life_low_days * _DAY,
        "medium": settings.half_life_medium_days * _DAY,
        "high": settings.half_life_high_hours * _HOUR,
    }
