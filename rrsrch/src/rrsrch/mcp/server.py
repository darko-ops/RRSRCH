"""The agent-facing MCP server (stdio). THIN: it only maps tool calls onto
mcp/tools.py — no business logic here. The FastAPI app (api.py) shares the same
core (factory.build_corpus)."""
from __future__ import annotations

from typing import Any

from mcp.server.fastmcp import FastMCP

from ..credentials import default_depositor
from ..factory import build_corpus
from .tools import tool_corroborate, tool_deposit, tool_recalls, tool_search

mcp = FastMCP("rrsrch")
_corpus = build_corpus()


@mcp.tool()
async def search(query: str = "", scope: dict[str, Any] | None = None,
                 deposit_id: str | None = None) -> dict:
    """Check the corpus before doing expensive research. Returns the best matching
    deposit with its live `confidence`, `age_seconds`, `sources`, and a `serve`
    boolean — or a structured no-serve: `outcome` is 'hit' (use the `claim`),
    'stale' (the corpus knows this question but confidence decayed — re-derive,
    then corroborate(deposit_id, ...) with what you found), or 'miss' (re-derive,
    then deposit()). Pass `scope` (e.g. {"region": "us-east-1"}) so a
    region/version-specific answer isn't served for the wrong scope. Pass
    `deposit_id` INSTEAD of a query to check whether an answer you cached earlier
    is still alive — if it was retired you get `superseded_by` + the live
    `replacement`."""
    return await tool_search(_corpus, query, scope, deposit_id)


@mcp.tool()
async def recalls(since: str) -> list[dict]:
    """Correction feed: every deposit retired since the ISO timestamp `since`, as
    {retired_deposit_id, superseded_by, topic_id, retired_at}. Poll this if you
    cache rrsrch answers outside rrsrch, so a corrected claim propagates to you."""
    return await tool_recalls(_corpus, since)


@mcp.tool()
async def deposit(
    query: str, claim: str, sources: list[dict] | None = None, volatility_hint: str = "medium",
    scope: dict[str, Any] | None = None, depositor: str | None = None,
    derivation_tokens: int | None = None,
) -> dict:
    """Store a distilled, cited result so this question is never re-derived. `claim`
    is the compact self-contained answer; `sources` is [{url, retrieved_at?, title?}];
    `volatility_hint` is low|medium|high (how fast it goes stale); `scope` records any
    constraints (region/version/date). Pass `derivation_tokens` — the actual token
    cost of the research that produced this claim, if you know it — so later reuse
    counts MEASURED savings instead of an estimate. Returns {id, created_at,
    volatility}."""
    return await tool_deposit(_corpus, query, claim, sources, volatility_hint, scope,
                              depositor or default_depositor(), derivation_tokens)


@mcp.tool()
async def corroborate(
    deposit_id: str, claim: str, sources: list[dict] | None = None, depositor: str | None = None,
    derivation_tokens: int | None = None,
) -> dict:
    """After a 'stale' search: report what fresh research found for that deposit.
    If your `claim` agrees with the stored one (deterministic check), its confidence
    is re-earned to 1.0. If it disagrees, the old deposit is retired and superseded
    by yours — later searches return the new claim. Returns {outcome: agreed|
    disagreed|not_found|retired, new_deposit_id?, superseded_by?}."""
    return await tool_corroborate(_corpus, deposit_id, claim, sources,
                                  depositor or default_depositor(), derivation_tokens)


def main() -> None:  # pragma: no cover
    mcp.run()


if __name__ == "__main__":  # pragma: no cover
    main()
