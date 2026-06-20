"""The agent-facing MCP server (stdio). THIN: it only maps tool calls onto
mcp/tools.py — no business logic here. The FastAPI app (api.py) shares the same
core (factory.build_corpus)."""
from __future__ import annotations

from typing import Any

from mcp.server.fastmcp import FastMCP

from ..factory import build_corpus
from .tools import tool_deposit, tool_search

mcp = FastMCP("rrsrch")
_corpus = build_corpus()


@mcp.tool()
async def search(query: str, scope: dict[str, Any] = {}) -> dict:
    """Check the corpus before doing expensive research. Returns the best matching
    deposit with its freshness `confidence`, `age_seconds`, `sources`, and a `serve`
    boolean — or a structured miss ({"serve": false, "outcome": "miss", "reason": ...}).
    `serve: true` means use the `claim`; otherwise do the research and deposit() it.
    Pass `scope` (e.g. {"region": "us-east-1"}) so a region/version-specific answer
    isn't served for the wrong scope."""
    return await tool_search(_corpus, query, scope)


@mcp.tool()
async def deposit(
    query: str, claim: str, sources: list[dict] = [], volatility_hint: str = "medium",
    scope: dict[str, Any] = {}, depositor: str = "local",
) -> dict:
    """Store a distilled, cited result so this question is never re-derived. `claim`
    is the compact self-contained answer; `sources` is [{url, retrieved_at?, title?}];
    `volatility_hint` is low|medium|high (how fast it goes stale); `scope` records any
    constraints (region/version/date). Returns {id, created_at, volatility}."""
    return await tool_deposit(_corpus, query, claim, sources, volatility_hint, scope, depositor)


def main() -> None:  # pragma: no cover
    mcp.run()


if __name__ == "__main__":  # pragma: no cover
    main()
