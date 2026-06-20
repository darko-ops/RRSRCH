"""The agent-facing MCP server (stdio). DELIBERATELY THIN: it only translates MCP
tool calls into tools.py calls — no business logic lives here. Agents read these
docstrings, so they're written for an agent audience."""
from __future__ import annotations

from typing import Any

from mcp.server.fastmcp import FastMCP

from .factory import build_corpus
from .tools import tool_corroborate, tool_deposit, tool_search

mcp = FastMCP("rrsrch")
_corpus = build_corpus()


@mcp.tool()
async def rrsrch_search(query: str, scope: dict[str, Any] = {}, threshold: float | None = None) -> dict:
    """Look up a previously-researched answer before doing expensive research yourself.

    Returns {outcome, advice, ...}. outcome is one of:
      - 'hit'   : a trustworthy answer exists — use `claim` (advice: "use this").
      - 'stale' : a matching answer exists but its confidence is below threshold —
                  re-derive it, then deposit the fresh result.
      - 'miss'  : nothing matches — do the research, then deposit it.
    On a hit you also get confidence, similarity, age, provenance, and sources.
    `scope` (e.g. {"region": "us-east-1", "version": "4"}) prevents serving a right
    answer to the wrong question.
    """
    return await tool_search(_corpus, query, scope, threshold)


@mcp.tool()
async def rrsrch_deposit(
    query: str, claim: str, sources: list[dict] = [], volatility_hint: str = "medium",
    scope: dict[str, Any] = {}, depositor: str = "local",
) -> dict:
    """Contribute a distilled, cited result after you've done real research, so no
    agent has to derive it again. `claim` is the compact, self-contained answer;
    `sources` is [{url, retrieved_at?, title?}]; `volatility_hint` is low|medium|high
    (how fast this answer goes stale). Returns {deposit_id, base_confidence}."""
    return await tool_deposit(_corpus, query, claim, sources, volatility_hint, scope, depositor)


@mcp.tool()
async def rrsrch_corroborate(query: str, fresh_claim: str, scope: dict[str, Any] = {}) -> dict:
    """Report a freshly-derived answer for a query that already has a deposit. If it
    agrees, the deposit's confidence is reinforced; if it disagrees, the stale deposit
    is retired and superseded by yours. Returns {result: agreed|disagreed|no_match}."""
    return await tool_corroborate(_corpus, query, fresh_claim, scope)


def main() -> None:  # pragma: no cover - process entrypoint
    mcp.run()


if __name__ == "__main__":  # pragma: no cover
    main()
