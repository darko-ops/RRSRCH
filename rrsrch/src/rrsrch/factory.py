"""Wire a Corpus from settings. Selects the embedder + store implementation so the
same Corpus logic runs offline (hash + memory) or deployed (sentence-transformers +
Postgres/pgvector). Heavy/optional impls are imported lazily."""
from __future__ import annotations

from .config import Settings, get_settings
from .corpus import Corpus
from .embedder import get_embedder
from .store import CorpusStore, InMemoryCorpusStore


def build_store(settings: Settings) -> CorpusStore:
    if settings.store == "memory":
        return InMemoryCorpusStore()
    from .store_pg import PostgresCorpusStore  # lazy: needs sqlalchemy/asyncpg

    return PostgresCorpusStore(settings)


def build_corpus(settings: Settings | None = None) -> Corpus:
    s = settings or get_settings()
    return Corpus(build_store(s), get_embedder(s), s)
