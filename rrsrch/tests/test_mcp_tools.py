"""Tests the agent-facing tool contract (tools.py) directly — no `mcp` SDK needed.
mcp_server.py is a thin transport over exactly these functions."""
from __future__ import annotations

import asyncio

from rrsrch.tools import tool_corroborate, tool_deposit, tool_search

run = asyncio.run


def test_deposit_then_search_roundtrip(make_corpus):
    corpus, _ = make_corpus()
    dep = run(tool_deposit(
        corpus, query="CMMC Level 2 assessment requirements",
        claim="110 NIST 800-171 controls; C3PAO assessment.",
        sources=[{"url": "https://dodcio.defense.gov/cmmc", "title": "DoD CMMC"}],
        volatility_hint="low"))
    assert "deposit_id" in dep and dep["base_confidence"] == 0.80

    hit = run(tool_search(corpus, "what does CMMC level 2 require for assessment?"))
    assert hit["outcome"] == "hit"
    assert "advice" in hit and "claim" in hit


def test_search_miss_shape(make_corpus):
    corpus, _ = make_corpus()
    out = run(tool_search(corpus, "unrelated question about nothing"))
    assert out["outcome"] == "miss"
    assert "advice" in out


def test_corroborate_agreement(make_corpus):
    corpus, _ = make_corpus()
    claim = "CMMC Level 2 requires 110 NIST 800-171 controls assessed by a C3PAO."
    run(tool_deposit(corpus, query="CMMC Level 2 assessment requirements", claim=claim, volatility_hint="low"))
    res = run(tool_corroborate(corpus, "CMMC Level 2 assessment requirements", claim))
    assert res["result"] == "agreed"
