"""Offline fixtures: in-memory store + hash embedder + controllable clock, so the
matching engine and corpus run with no Postgres and no model download. The hash
embedder is weaker than MiniLM, so the offline similarity threshold is lower (see
DECISIONS); the scope gate, confidence math, and cost ratio are embedder-independent."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from random import Random
from typing import Any

import pytest

from rrsrch.config import Settings
from rrsrch.corpus import Corpus
from rrsrch.embeddings import HashEmbedder
from rrsrch.schemas import ResearchResult, Source
from rrsrch.store.memory import InMemoryStore

T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)

# RRSRCH_TEST_STORE=postgres runs the ENTIRE suite against real Postgres
# (docker compose up -d db + alembic upgrade head first). Default: memory.
TEST_STORE = os.environ.get("RRSRCH_TEST_STORE", "memory")


def offline_settings(**over) -> Settings:
    base = dict(store="memory", embedder="hash", similarity_threshold=0.55,
                # topic clustering threshold mirrors the search threshold's offline
                # tuning: hash embedder is weaker than MiniLM (see DECISIONS)
                topic_similarity_threshold=0.50,
                confidence_threshold=0.70, cold_path_estimate_tokens=90_000)
    base.update(over)
    return Settings(**base)


class Clock:
    def __init__(self, t: datetime = T0) -> None:
        self.t = t

    def __call__(self) -> datetime:
        return self.t


class FixedRandom(Random):
    """Deterministic coin for explore-vs-exploit tests: always/never explore."""

    def __init__(self, value: float) -> None:
        super().__init__(0)
        self._value = value

    def random(self) -> float:
        return self._value


class FakeProvider:
    """Injectable SearchProvider: tests supply the 'fresh' answer deterministically
    (never hits the live web). `answers` maps query → claim, or set `answer` for
    all queries; a callable answer receives (query, call_index)."""

    def __init__(self, answer: Any = None, answers: dict[str, str] | None = None,
                 tokens_spent: int = 5_000) -> None:
        self.answer = answer
        self.answers = answers or {}
        self.tokens_spent = tokens_spent
        self.calls: list[str] = []

    async def research(self, query: str, scope: dict[str, Any] | None) -> ResearchResult:
        self.calls.append(query)
        claim = self.answers.get(query)
        if claim is None:
            claim = (self.answer(query, len(self.calls)) if callable(self.answer)
                     else self.answer)
        assert claim is not None, f"FakeProvider has no answer for {query!r}"
        return ResearchResult(claim=claim, tokens_spent=self.tokens_spent,
                              sources=[Source(url="https://example.test/fresh")])


@pytest.fixture
async def make_corpus():
    if TEST_STORE == "postgres":
        # Fresh NullPool engine per test: every session opens its own connection,
        # so nothing leaks across pytest-asyncio event loops; truncate for isolation.
        from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
        from sqlalchemy.pool import NullPool

        from rrsrch.store.postgres import PostgresStore

        settings = offline_settings(store="postgres")
        engine = create_async_engine(settings.database_url, poolclass=NullPool)
        async with engine.begin() as conn:
            from sqlalchemy import text
            await conn.execute(text("TRUNCATE deposits, query_events, topic_state"))
        sm = async_sessionmaker(engine, expire_on_commit=False)

        def _make_pg(clock: Clock | None = None, rng: Random | None = None,
                     provider: Any = None, **over):
            clk = clock or Clock()
            return Corpus(PostgresStore(offline_settings(store="postgres", **over), sm),
                          HashEmbedder(384), offline_settings(store="postgres", **over),
                          now=clk, rng=rng or Random(42), provider=provider), clk

        yield _make_pg
        await engine.dispose()
        return

    def _make(clock: Clock | None = None, rng: Random | None = None,
              provider: Any = None, **over):
        clk = clock or Clock()
        return Corpus(InMemoryStore(), HashEmbedder(384), offline_settings(**over),
                      now=clk, rng=rng or Random(42), provider=provider), clk
    yield _make
