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
    base: float = 1.0,
) -> float:
    """Live confidence: BASE × decay from the most recent confirmation moment.

    Corroboration re-earns confidence by moving the anchor forward — an agreeing
    corroboration at time T makes confidence `base` at T, decaying afresh.

    `half_life_factor` is the topic-level bandit adjustment (Phase 1): a settled
    topic earns a factor > 1 (slower decay); a disagreeing topic earns < 1.

    `base` is the depositor-trust term (Phase 2): 1.0 for a fully trusted or
    independently vouched source, trust_base(...) otherwise. A proven-bad
    depositor's base sits BELOW the serve threshold, so its lone deposits never
    serve at any age. Deterministic code computes both inputs — never an LLM.
    """
    anchor = last_corroborated_at or created_at
    if last_corroborated_at is not None and last_corroborated_at < created_at:
        anchor = created_at  # never trust a corroboration stamped before creation
    age = (now - anchor).total_seconds()
    if age <= 0:
        return base
    return base * 0.5 ** (age / (half_life_seconds(volatility, table) * half_life_factor))


def should_serve(conf: float, threshold: float = DEFAULT_CONFIDENCE_THRESHOLD) -> bool:
    return conf >= threshold


# ------------------------------------------------ trust by track record (Phase 2)
# Trust is a PURE function of recorded corroboration outcomes — an LLM never
# computes or influences it. It feeds the confidence BASE term (the same slot
# Phase 3's Ominis attestation will later occupy); decay, corroboration
# re-earning, and the bandit are unchanged.

def trust_score(agreed: int, contradicted: int,
                prior_mean: float, prior_strength: float) -> float:
    """Beta-style ratio with a modest prior: unknown depositors (0, 0) land AT
    the prior — serviceable, not sub-serve. Independent agreements pull toward
    1; independent contradictions pull toward 0. Bounded (0, 1)."""
    alpha = prior_mean * prior_strength
    beta = (1.0 - prior_mean) * prior_strength
    return (agreed + alpha) / (agreed + contradicted + alpha + beta)


def trust_base(trust: float, prior_mean: float, base_at_prior: float,
               sub_slope: float) -> float:
    """Map trust → the confidence BASE (confidence at the anchor).

    Piecewise linear, asymmetric by design:
      - at the prior (unknown) → base_at_prior: serves, but decays below the
        threshold sooner than a proven-good agent's → re-verified sooner;
      - above the prior → gently approaches 1.0 (proven-good);
      - below the prior → drops STEEPLY (sub_slope) so a track record of
        contradictions sinks the base under the serve threshold: proven-bad
        agents' lone deposits never serve until independently vouched.
    """
    if trust >= prior_mean:
        hi_slope = (1.0 - base_at_prior) / max(1.0 - prior_mean, 1e-9)
        return min(1.0, base_at_prior + hi_slope * (trust - prior_mean))
    return max(0.0, base_at_prior - sub_slope * (prior_mean - trust))


def half_lives_from_settings(settings) -> dict[str, float]:
    return {
        "low": settings.half_life_low_days * _DAY,
        "medium": settings.half_life_medium_days * _DAY,
        "high": settings.half_life_high_hours * _HOUR,
    }
