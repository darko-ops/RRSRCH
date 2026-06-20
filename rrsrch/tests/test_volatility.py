from __future__ import annotations

from rrsrch.volatility import classify, half_life_seconds
from rrsrch import confidence as C


def test_valid_hint_is_trusted():
    assert classify("anything", "high") == "high"
    assert classify("anything", "medium") == "medium"
    assert classify("the Magna Carta signing date", "low") == "low"


def test_low_hint_on_fresh_query_is_nudged_up():
    # Depositor claims 'low' but the query is obviously live -> don't trust 'low'.
    assert classify("current S3 price per GB", "low") == "medium"


def test_no_hint_uses_keywords():
    assert classify("current AWS S3 price per GB") == "high"
    assert classify("what year was the Magna Carta signed") == "low"
    assert classify("how does Helios batch usage events") == "medium"  # neutral default


def test_invalid_hint_falls_back_to_keywords():
    assert classify("latest exchange rate", "bogus") == "high"


def test_half_life_delegates_to_confidence():
    for v in ("low", "medium", "high"):
        assert half_life_seconds(v) == C.half_life(v)
