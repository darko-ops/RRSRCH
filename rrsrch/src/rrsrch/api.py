"""Internal HTTP API (FastAPI): health, metrics (the savings report), and debug.
The agent-facing surface is MCP (mcp_server.py); this is for operators."""
from __future__ import annotations

from fastapi import FastAPI

from .corpus import Corpus


def create_app(corpus: Corpus | None = None) -> FastAPI:
    app = FastAPI(title="rrsrch", version="0.1.0")

    def _corpus() -> Corpus:
        nonlocal corpus
        if corpus is None:
            from .factory import build_corpus  # lazy so import works without a DB

            corpus = build_corpus()
        return corpus

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok"}

    @app.get("/metrics")
    async def metrics() -> dict:
        return await _corpus().savings_report()

    @app.get("/debug/savings")
    async def debug_savings() -> dict:
        return await _corpus().savings_report()

    return app


def main() -> None:  # pragma: no cover - process entrypoint
    import uvicorn

    uvicorn.run(create_app(), host="0.0.0.0", port=8000)
