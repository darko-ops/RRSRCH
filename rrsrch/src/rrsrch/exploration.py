"""Exploration — the multi-armed bandit update rules over topics.

=============================================================================
THE INVIOLABLE RULE: the explore-vs-exploit decision, the exploration-rate
update, and the observed-volatility override are DETERMINISTIC, auditable
code. An LLM never touches this module. The only randomness is the coin flip
in should_explore(), and its RNG is injected so tests are deterministic.
=============================================================================

The bandit steers the verification budget toward uncertainty:

    agreement    → exploration_rate *= decay_factor   (toward the floor)
                   half_life_factor *= agreement_growth (decay slows — settled)
    disagreement → exploration_rate *= growth_factor  (toward the ceiling)
                   half_life_factor *= disagreement_shrink (decay speeds up)

Everything is bounded and every function here is pure.
"""
from __future__ import annotations

from random import Random


def seed_rate(volatility: str, settings) -> float:
    """Base exploration rate for a new topic — the volatility hint is the prior."""
    table = {
        "low": settings.exploration_base_low,
        "medium": settings.exploration_base_medium,
        "high": settings.exploration_base_high,
    }
    try:
        return _clamp(table[volatility], settings.exploration_floor, settings.exploration_ceiling)
    except KeyError as exc:
        raise ValueError(f"unknown volatility {volatility!r}") from exc


def rate_on_agreement(rate: float, settings) -> float:
    return _clamp(rate * settings.exploration_decay_factor,
                  settings.exploration_floor, settings.exploration_ceiling)


def rate_on_disagreement(rate: float, settings) -> float:
    return _clamp(rate * settings.exploration_growth_factor,
                  settings.exploration_floor, settings.exploration_ceiling)


def half_life_factor_on_agreement(factor: float, settings) -> float:
    return _clamp(factor * settings.half_life_agreement_growth,
                  settings.half_life_factor_min, settings.half_life_factor_max)


def half_life_factor_on_disagreement(factor: float, settings) -> float:
    return _clamp(factor * settings.half_life_disagreement_shrink,
                  settings.half_life_factor_min, settings.half_life_factor_max)


def observed_volatility(agreements: int, disagreements: int, settings) -> str | None:
    """Derive volatility from the topic's own history. The hint is a PRIOR: once
    there is enough evidence (min observations), what the topic actually did
    overrides what the depositor guessed. Returns None while evidence is thin."""
    total = agreements + disagreements
    if total < settings.observed_volatility_min_obs:
        return None
    rate = disagreements / total
    if rate >= settings.observed_high_cutoff:
        return "high"
    if rate >= settings.observed_medium_cutoff:
        return "medium"
    return "low"


def verification_priority(age_since_verified_seconds: float, rate: float) -> float:
    """Self-verification picks the topics where (staleness risk × uncertainty) is
    highest. A disagreement resets last_verified_at to None → age is huge →
    immediate re-verification, deterministically."""
    return max(0.0, age_since_verified_seconds) * rate


def should_explore(rng: Random, rate: float) -> bool:
    """The only stochastic call in the system. RNG is injected: real randomness in
    prod, a seeded Random in tests."""
    return rng.random() < rate


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))
