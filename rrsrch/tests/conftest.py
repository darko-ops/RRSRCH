"""Test fixtures. The offline pair (InMemoryCorpusStore + HashEmbedder) lets the
real corpus logic run with zero external services. A controllable clock simulates
age without waiting (required by the worked examples)."""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from rrsrch.config import Settings
from rrsrch.corpus import Corpus
from rrsrch.embedder import HashEmbedder
from rrsrch.store import InMemoryCorpusStore

T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)


def offline_settings(**over) -> Settings:
    # Floors tuned for the HashEmbedder (see DECISIONS); prod defaults are for MiniLM.
    base = dict(embedder="hash", similarity_floor=0.6, agreement_floor=0.9,
                cold_path_estimate_tokens=90_000)
    base.update(over)
    return Settings(**base)


class Clock:
    """Mutable injectable clock: set .t to simulate the passage of time."""
    def __init__(self, t: datetime = T0) -> None:
        self.t = t

    def __call__(self) -> datetime:
        return self.t


@pytest.fixture
def make_corpus():
    def _make(clock: Clock | None = None, **over) -> tuple[Corpus, Clock]:
        clk = clock or Clock()
        corpus = Corpus(InMemoryCorpusStore(), HashEmbedder(384), offline_settings(**over), now=clk)
        return corpus, clk
    return _make
