"""Map a deposit to a decay class. Deterministic; NO LLM.

Trust a caller's `volatility_hint`, but sanity-check it against keyword heuristics:
a query that screams freshness ("current price today") must not be trusted as 'low'
just because the depositor said so. Half-lives live in confidence.py (single source
of truth for the decay policy)."""
from __future__ import annotations

import re

from . import confidence

VALID = ("low", "medium", "high")

# Words that signal a fast-moving answer.
_HIGH = {
    "current", "currently", "today", "todays", "latest", "now", "live", "price",
    "prices", "pricing", "cost", "rate", "rates", "stock", "weather", "available",
    "this week", "right now", "as of", "trending",
}
# Words that signal a slow/stable answer.
_LOW = {
    "history", "historical", "founded", "signed", "definition", "define", "regulation",
    "law", "statute", "theorem", "born", "died", "established", "origin", "etymology",
}


def _scan(text: str) -> str | None:
    t = (text or "").lower()
    words = set(re.findall(r"[a-z]+", t))
    if any(p in t for p in _HIGH) or words & _HIGH:
        return "high"
    if any(p in t for p in _LOW) or words & _LOW:
        return "low"
    return None


def classify(query_text: str, hint: str | None = None) -> str:
    """Resolve final volatility.

    - Valid hint is trusted, EXCEPT: a 'low' hint on an obviously fresh query is
      nudged up to 'medium' (never silently trust 'low' for live data).
    - No/invalid hint -> keyword guess, default 'medium'.
    """
    guess = _scan(query_text)
    if hint in VALID:
        if hint == "low" and guess == "high":
            return "medium"
        return hint
    return guess or "medium"


def half_life_seconds(volatility: str) -> float:
    return confidence.half_life(volatility)
