"""Async engine/session factory."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from ..config import Settings

_engine: AsyncEngine | None = None
_sm: async_sessionmaker[AsyncSession] | None = None


def get_sessionmaker(settings: Settings) -> async_sessionmaker[AsyncSession]:
    global _engine, _sm
    if _sm is None:
        _engine = create_async_engine(settings.database_url, pool_pre_ping=True)
        _sm = async_sessionmaker(_engine, expire_on_commit=False)
    return _sm
