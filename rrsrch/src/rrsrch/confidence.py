"""
========================================================================
THE INVIOLABLE RULE
========================================================================
The confidence score and the serve-vs-miss decision are DETERMINISTIC CODE.
An LLM may help with fuzzy, recoverable tasks elsewhere (judging if two
questions are similar, distilling sources into a claim) but MUST NEVER compute
confidence or decide whether something is trustworthy.

This module is the trust boundary. It is therefore:
  - PURE: no IO, no network, no LLM, no DB, no clock-reading. `now` is passed in.
  - SELF-CONTAINED: it operates on a small `DepositState` value object, never on
    a SQLAlchemy row, so a DB/model dependency can never leak into the trust path.
  - EXHAUSTIVELY TESTED (tests/test_confidence.py).

Keep it that way. If you ever feel the urge to "ask the model how confident we
are," that urge is the bug.
========================================================================
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta

# --- tunable decay knobs (these ARE the policy; mirrored by config defaults) ---
_DAY = 86_400.0
HALF_LIFE_SECONDS: dict[str, float] = {
    "low": 180 * _DAY,   # regulation, historical facts — barely decays
    "medium": 14 * _DAY,  # general knowledge
    "high": 1 * _DAY,    # prices, live data — stale within days
}
DEFAULT_SERVE_THRESHOLD = 0.70
RETIRE_FLOOR = 0.15
BASE_CONFIDENCE = 0.80
CORROBORATION_CAP = 1.6
CORROBORATION_SLOPE = 0.15


@dataclass(frozen=True)
class DepositState:
    """The minimal, ORM-free view of a deposit the trust engine needs."""
    base_confidence: float
    created_at: datetime
    volatility: str
    corroboration_count: int = 0
    disagreement_count: int = 0
    last_corroborated_at: datetime | None = None


def base(depositor: str, attestation: object | None = None) -> float:
    """Initial (pre-decay) confidence for a depositor.

    Phase 0: no Ominis — every depositor gets a fixed base. The `attestation`
    parameter is reserved for the Phase 3 handshake (an attested agent will start
    higher); it is intentionally unused now.
    """
    return BASE_CONFIDENCE


def half_life(volatility: str) -> float:
    try:
        return HALF_LIFE_SECONDS[volatility]
    except KeyError as exc:
        raise ValueError(f"unknown volatility {volatility!r}") from exc


def decay(age_seconds: float, volatility: str) -> float:
    """Exponential decay in (0, 1]. Newer => closer to 1."""
    if age_seconds <= 0:
        return 1.0
    return 0.5 ** (age_seconds / half_life(volatility))


def corroboration_boost(corroboration_count: int) -> float:
    """Multiplier >= 1.0 with diminishing returns, capped."""
    if corroboration_count <= 0:
        return 1.0
    return min(1.0 + CORROBORATION_SLOPE * math.log1p(corroboration_count), CORROBORATION_CAP)


def disagreement_penalty(disagreement_count: int) -> float:
    """Sharp multiplier in (0, 1]. One disagreement halves; two quarters."""
    if disagreement_count <= 0:
        return 1.0
    return 0.5 ** disagreement_count


def _age_anchor(d: DepositState) -> datetime:
    """Corroboration slows decay by re-anchoring the age clock to the last
    corroboration time (only once at least one corroboration exists)."""
    if d.corroboration_count > 0 and d.last_corroborated_at is not None:
        return d.last_corroborated_at
    return d.created_at


def confidence(deposit: DepositState, now: datetime) -> float:
    """Live confidence in [0, 1], deterministic."""
    age = (now - _age_anchor(deposit)).total_seconds()
    raw = (
        deposit.base_confidence
        * decay(age, deposit.volatility)
        * corroboration_boost(deposit.corroboration_count)
        * disagreement_penalty(deposit.disagreement_count)
    )
    return max(0.0, min(1.0, raw))


def serve_decision(confidence_value: float, threshold: float = DEFAULT_SERVE_THRESHOLD) -> str:
    """The whole product decision, in one deterministic line."""
    return "serve" if confidence_value >= threshold else "miss"


__all__ = [
    "DepositState", "base", "half_life", "decay", "corroboration_boost",
    "disagreement_penalty", "confidence", "serve_decision",
    "HALF_LIFE_SECONDS", "DEFAULT_SERVE_THRESHOLD", "RETIRE_FLOOR", "BASE_CONFIDENCE",
]
