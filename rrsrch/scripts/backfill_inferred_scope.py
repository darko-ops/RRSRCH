#!/usr/bin/env python3
"""Backfill deposits.inferred_scope for rows created before migration 0004.

Idempotent: only touches rows where inferred_scope IS NULL. The engine infers
on read for NULL rows anyway — this just persists the tags so the gate never
recomputes. Deterministic (same gazetteer as the live path).

    PYTHONPATH=src python scripts/backfill_inferred_scope.py
"""
from __future__ import annotations

import asyncio

from sqlalchemy import select

from rrsrch.config import Settings
from rrsrch.matching import scope
from rrsrch.store.db import get_sessionmaker
from rrsrch.store.models import Deposit


async def main() -> None:
    sm = get_sessionmaker(Settings(store="postgres"))
    async with sm() as s:
        rows = (await s.execute(
            select(Deposit).where(Deposit.inferred_scope.is_(None)))).scalars().all()
        for r in rows:
            r.inferred_scope = {d: sorted(v) for d, v in scope.infer(r.query).items()}
        await s.commit()
        print(f"backfilled {len(rows)} deposit(s)")


if __name__ == "__main__":
    asyncio.run(main())
