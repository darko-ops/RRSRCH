from __future__ import annotations

from rrsrch.matching.scope import conflicts


def test_conflict_on_shared_key():
    assert conflicts({"region": "us-east-1"}, {"region": "eu-west-1"}) is True
    assert conflicts({"version": "3"}, {"version": "4"}) is True


def test_no_conflict_when_equal_or_disjoint():
    assert conflicts({"region": "us-east-1"}, {"region": "us-east-1"}) is False
    assert conflicts({"region": "us-east-1"}, {"version": "4"}) is False  # no shared key
    assert conflicts(None, {"region": "x"}) is False
    assert conflicts({}, None) is False


def test_normalized_comparison():
    assert conflicts({"region": "US-EAST-1"}, {"region": " us-east-1 "}) is False
