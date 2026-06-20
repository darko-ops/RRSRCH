"""Offline fixtures: in-memory store + hash embedder + controllable clock, so the
matching engine and corpus run with no Postgres and no model download. The hash
embedder is weaker than MiniLM, so the offline similarity threshold is lower (see
DECISIONS); the scope gate and cost ratio are embedder-independent."""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from rrsrch.config import Settings
from rrsrch.corpus import Corpus
from rrsrch.embeddings import HashEmbedder
from rrsrch.store.memory import InMemoryStore

T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)


def offline_settings(**over) -> Settings:
    base = dict(store="memory", embedder="hash", similarity_threshold=0.55,
                freshness_threshold=0.5, cold_path_estimate_tokens=90_000)
    base.update(over)
    return Settings(**base)


class Clock:
    def __init__(self, t: datetime = T0) -> None:
        self.t = t

    def __call__(self) -> datetime:
        return self.t


@pytest.fixture
def make_corpus():
    def _make(clock: Clock | None = None, **over):
        clk = clock or Clock()
        return Corpus(InMemoryStore(), HashEmbedder(384), offline_settings(**over), now=clk), clk
    return _make
