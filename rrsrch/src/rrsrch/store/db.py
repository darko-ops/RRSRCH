"""Async engine/session factory. Engines are cached PER DATABASE URL — the old
module-level singleton silently ignored any Settings after the first call (a
real bug the in-memory store hid until the suite ran against Postgres)."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import (AsyncSession, async_sessionmaker,
                                    create_async_engine)

from ..config import Settings

_sessionmakers: dict[str, async_sessionmaker[AsyncSession]] = {}


def get_sessionmaker(settings: Settings) -> async_sessionmaker[AsyncSession]:
    url = settings.database_url
    if url not in _sessionmakers:
        engine = create_async_engine(url, pool_pre_ping=True)
        _sessionmakers[url] = async_sessionmaker(engine, expire_on_commit=False)
    return _sessionmakers[url]
