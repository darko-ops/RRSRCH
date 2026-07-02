"""Phase 2 thread 1: deposits.inferred_scope — implicit scope extracted from
the deposit's query prose. NULL rows are inferred on read (engine fallback);
run scripts/backfill_inferred_scope.py to persist tags for existing rows.

Revision ID: 0004_inferred_scope
Revises: 0003_exploration
Create Date: 2026-07-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004_inferred_scope"
down_revision = "0003_exploration"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("deposits",
                  sa.Column("inferred_scope", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("deposits", "inferred_scope")
