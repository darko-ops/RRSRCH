"""Agent-facing tool logic, kept out of the MCP server file so it has no dependency
on the `mcp` SDK and is directly unit-testable. The server is a thin transport over
these three functions."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from ..corpus import Corpus
from ..schemas import DepositIn, Source


async def tool_search(corpus: Corpus, query: str = "", scope: dict[str, Any] | None = None,
                      deposit_id: str | None = None) -> dict[str, Any]:
    if deposit_id:
        # lookup mode: "is the answer I cached still alive?" — returns the
        # supersession pointer + live replacement if it was retired.
        return await corpus.lookup(deposit_id)
    out = await corpus.search(query, scope or None)
    return out.model_dump(exclude_none=True, mode="json")


async def tool_recalls(corpus: Corpus, since: str) -> list[dict[str, Any]]:
    ts = datetime.fromisoformat(since)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return [r.model_dump(exclude_none=True, mode="json") for r in await corpus.recalls(ts)]


async def tool_deposit(
    corpus: Corpus, query: str, claim: str, sources: list[dict[str, Any]] | None = None,
    volatility_hint: str = "medium", scope: dict[str, Any] | None = None, depositor: str = "local",
    attestation: str | None = None,
) -> dict[str, Any]:
    rec = await corpus.deposit(DepositIn(
        query=query, claim=claim, sources=[Source(**s) for s in (sources or [])],
        volatility_hint=volatility_hint, scope=scope or None, depositor=depositor,
        attestation=attestation,
    ))
    return {"id": str(rec.id), "created_at": rec.created_at.isoformat(), "volatility": rec.volatility}


async def tool_corroborate(
    corpus: Corpus, deposit_id: str, claim: str,
    sources: list[dict[str, Any]] | None = None, depositor: str = "local",
    attestation: str | None = None,
) -> dict[str, Any]:
    out = await corpus.corroborate(
        deposit_id, claim, sources=[Source(**s) for s in (sources or [])],
        depositor=depositor, attestation=attestation)
    return out.model_dump(exclude_none=True, mode="json")
