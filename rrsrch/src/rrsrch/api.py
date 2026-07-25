"""Operator HTTP API (FastAPI): health, telemetry metrics, the recall feed,
topic state (debugging the bandit), the recent-event feed, and the live
/dashboard page. The agent surface is MCP; this shares the same core via
factory.build_corpus."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from .corpus import Corpus
from .dashboard import DASHBOARD_HTML

# Read-only observability may be viewed from the rrsrch.com account dashboard —
# the browser (same machine as this API) fetches /metrics and /recent directly,
# so nothing leaves the operator's machine. GET only; no credentials.
CORS_ORIGINS = ["https://rrsrch.com", "https://www.rrsrch.com",
                "http://localhost:3000", "http://localhost:8110"]


def create_app(corpus: Corpus | None = None) -> FastAPI:
    app = FastAPI(title="rrsrch", version="0.2.0")
    # allow_private_network: Chrome PNA — a public https origin fetching loopback
    # sends a preflight with Access-Control-Request-Private-Network, and Starlette
    # rejects that preflight (400) unless this opt-in is set.
    app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS,
                       allow_methods=["GET"], allow_headers=["*"],
                       allow_private_network=True)

    def _corpus() -> Corpus:
        nonlocal corpus
        if corpus is None:
            from .factory import build_corpus  # lazy so import works without a DB

            corpus = build_corpus()
        return corpus

    @app.get("/whoami")
    async def whoami() -> dict:
        # which rrsrch.com account this instance is paired to (never the token)
        from .credentials import whoami as _whoami
        return _whoami()

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

    @app.get("/recent")
    async def recent(limit: int = 30) -> list[dict]:
        # read-only event feed for the dashboard; clamp so a bad param can't
        # turn into a full-table pull
        return await _corpus().recent(limit=max(1, min(limit, 200)))

    @app.get("/dashboard")
    async def dashboard() -> HTMLResponse:
        # self-contained page (inline CSS/JS, no CDNs); same-origin polls of
        # /metrics, /recent, /topics, /recalls — so no CORS setup needed
        return HTMLResponse(DASHBOARD_HTML)

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
