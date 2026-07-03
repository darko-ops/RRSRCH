"""Wire a Corpus from settings; pick store + embedder implementation. Heavy/optional
implementations are imported lazily so the package imports without their deps."""
from __future__ import annotations

from .config import Settings
from .corpus import Corpus
from .embeddings import get_embedder
from .store.base import Store
from .store.memory import InMemoryStore


def build_store(settings: Settings) -> Store:
    if settings.store == "memory":
        return InMemoryStore()
    from .store.postgres import PostgresStore  # lazy: needs sqlalchemy/asyncpg

    return PostgresStore(settings)


def build_corpus(settings: Settings | None = None) -> Corpus:
    s = settings or Settings()
    return Corpus(build_store(s), get_embedder(s), s)
