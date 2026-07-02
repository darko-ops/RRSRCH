"""Tests the agent-facing tool contract directly (no `mcp` SDK needed)."""
from __future__ import annotations

from rrsrch.mcp.tools import tool_corroborate, tool_deposit, tool_search


async def test_deposit_then_search(make_corpus):
    corpus, _ = make_corpus()
    d = await tool_deposit(corpus, query="CMMC Level 2 assessment requirements",
                           claim="110 controls; C3PAO.",
                           sources=[{"url": "https://dodcio.defense.gov/cmmc"}],
                           volatility_hint="low")
    assert "id" in d and d["volatility"] == "low"

    hit = await tool_search(corpus, "what does CMMC level 2 require for assessment?")
    assert hit["serve"] is True and hit["outcome"] == "hit"


async def test_search_miss_is_structured_not_an_error(make_corpus):
    corpus, _ = make_corpus()
    out = await tool_search(corpus, "nothing here")
    assert out["serve"] is False and out["outcome"] == "miss" and "reason" in out


async def test_search_scope_blocks_wrong_region(make_corpus):
    corpus, _ = make_corpus()
    await tool_deposit(corpus, query="S3 price per GB", claim="$0.023",
                       scope={"region": "us-east-1"}, volatility_hint="medium")
    out = await tool_search(corpus, "S3 price per GB", scope={"region": "eu-west-1"})
    assert out["serve"] is False


async def test_corroborate_tool_roundtrip(make_corpus):
    corpus, _ = make_corpus()
    d = await tool_deposit(corpus, query="current S3 price per GB", claim="$0.023",
                           volatility_hint="high")
    agreed = await tool_corroborate(corpus, d["id"], "$0.023",
                                    sources=[{"url": "https://aws.amazon.com/s3/pricing/"}])
    assert agreed["outcome"] == "agreed"
    assert agreed["confidence"] >= 0.9   # anchor re-earned at the author's trust base

    disagreed = await tool_corroborate(corpus, d["id"], "$0.021 after the Jan price cut")
    assert disagreed["outcome"] == "disagreed" and "new_deposit_id" in disagreed
