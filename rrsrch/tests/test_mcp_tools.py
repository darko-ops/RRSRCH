"""Tests the agent-facing tool contract directly (no `mcp` SDK needed)."""
from __future__ import annotations

import asyncio

from rrsrch.mcp.tools import tool_deposit, tool_search

run = asyncio.run


def test_deposit_then_search(make_corpus):
    corpus, _ = make_corpus()
    d = run(tool_deposit(corpus, query="CMMC Level 2 assessment requirements",
                         claim="110 controls; C3PAO.",
                         sources=[{"url": "https://dodcio.defense.gov/cmmc"}], volatility_hint="low"))
    assert "id" in d and d["volatility"] == "low"

    hit = run(tool_search(corpus, "what does CMMC level 2 require for assessment?"))
    assert hit["serve"] is True and hit["outcome"] == "hit"


def test_search_miss_is_structured_not_an_error(make_corpus):
    corpus, _ = make_corpus()
    out = run(tool_search(corpus, "nothing here"))
    assert out["serve"] is False and out["outcome"] == "miss" and "reason" in out


def test_search_scope_blocks_wrong_region(make_corpus):
    corpus, _ = make_corpus()
    run(tool_deposit(corpus, query="S3 price per GB", claim="$0.023",
                     scope={"region": "us-east-1"}, volatility_hint="medium"))
    out = run(tool_search(corpus, "S3 price per GB", scope={"region": "eu-west-1"}))
    assert out["serve"] is False
