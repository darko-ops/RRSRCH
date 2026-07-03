"""Operator HTTP API (FastAPI): health, telemetry metrics, the recall feed, and
topic state (debugging the bandit). The agent surface is MCP; this shares the
same core via factory.build_corpus."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI

from .corpus import Corpus


def create_app(corpus: Corpus | None = None) -> FastAPI:
    app = FastAPI(title="rrsrch", version="0.2.0")

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

    @app.get("/recalls")
    async def recalls(since: str) -> list[dict]:
        ts = datetime.fromisoformat(since)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return [r.model_dump(exclude_none=True, mode="json")
                for r in await _corpus().recalls(ts)]

    @app.get("/topics")
    async def topics() -> dict:
        c = _corpus()
        return {t.topic_id: {
            "scope_key": t.scope_key,
            "base_volatility": t.base_volatility,
            "observed_volatility": t.observed_volatility,
            "exploration_rate": round(t.exploration_rate, 6),
            "half_life_factor": round(t.half_life_factor, 4),
            "agreements": t.agreement_count,
            "disagreements": t.disagreement_count,
            "last_verified_at": t.last_verified_at.isoformat() if t.last_verified_at else None,
        } for t in await c.store.list_topics()}

    return app


def main() -> None:  # pragma: no cover
    import uvicorn

    uvicorn.run(create_app(), host="0.0.0.0", port=8000)
