"""Operator HTTP API (FastAPI): health + the telemetry metrics. The agent surface
is MCP; this shares the same core via factory.build_corpus."""
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
        return await _corpus().metrics()

    return app


def main() -> None:  # pragma: no cover
    import uvicorn

    uvicorn.run(create_app(), host="0.0.0.0", port=8000)
