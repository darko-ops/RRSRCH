"""Agent-facing tool logic, kept out of the MCP server file so it has no dependency
on the `mcp` SDK and is directly unit-testable. The server is a thin transport over
these two functions."""
from __future__ import annotations

from typing import Any

from ..corpus import Corpus
from ..schemas import DepositIn, Source


async def tool_search(corpus: Corpus, query: str, scope: dict[str, Any] | None = None) -> dict[str, Any]:
    out = await corpus.search(query, scope or None)
    return out.model_dump(exclude_none=True, mode="json")


async def tool_deposit(
    corpus: Corpus, query: str, claim: str, sources: list[dict[str, Any]] | None = None,
    volatility_hint: str = "medium", scope: dict[str, Any] | None = None, depositor: str = "local",
) -> dict[str, Any]:
    rec = await corpus.deposit(DepositIn(
        query=query, claim=claim, sources=[Source(**s) for s in (sources or [])],
        volatility_hint=volatility_hint, scope=scope or None, depositor=depositor,
    ))
    return {"id": str(rec.id), "created_at": rec.created_at.isoformat(), "volatility": rec.volatility}
