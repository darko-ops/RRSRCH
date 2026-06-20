"""The agent-facing tool logic, kept OUT of the MCP server file so it has no
dependency on the `mcp` SDK and can be unit-tested directly. mcp_server.py is a
thin transport that imports and registers these."""
from __future__ import annotations

from typing import Any

from .corpus import Corpus
from .schemas import DepositIn, Source


async def tool_search(
    corpus: Corpus, query: str, scope: dict[str, Any] | None = None, threshold: float | None = None
) -> dict[str, Any]:
    out = await corpus.search(query, scope or {}, threshold)
    return out.model_dump(exclude_none=True, mode="json")


async def tool_deposit(
    corpus: Corpus, query: str, claim: str, sources: list[dict[str, Any]] | None = None,
    volatility_hint: str = "medium", scope: dict[str, Any] | None = None, depositor: str = "local",
) -> dict[str, Any]:
    rec = await corpus.deposit(DepositIn(
        query=query, claim=claim,
        sources=[Source(**s) for s in (sources or [])],
        volatility_hint=volatility_hint, scope=scope or {}, depositor=depositor,
    ))
    return {"deposit_id": str(rec.id), "base_confidence": rec.base_confidence, "volatility": rec.volatility}


async def tool_corroborate(
    corpus: Corpus, query: str, fresh_claim: str, scope: dict[str, Any] | None = None
) -> dict[str, Any]:
    return await corpus.corroborate(query, fresh_claim, scope or {})
