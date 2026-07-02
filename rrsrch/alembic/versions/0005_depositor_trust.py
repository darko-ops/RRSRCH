"""Phase 2 thread 2: depositor_trust table + deposits.independent_corroboration_count.

Backfill note: historical query_events record corroboration OUTCOMES but not the
corroborating depositor's identity, so independence cannot be reconstructed —
every existing depositor therefore starts at the prior (an empty trust table IS
the correct backfill: unknown ⇒ prior by definition). The independent count
starts at 0 for existing deposits for the same reason.

Revision ID: 0005_depositor_trust
Revises: 0004_inferred_scope
Create Date: 2026-07-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005_depositor_trust"
down_revision = "0004_inferred_scope"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "depositor_trust",
        sa.Column("depositor", sa.String(256), primary_key=True),
        sa.Column("agreed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("contradicted_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("score", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column("deposits", sa.Column("independent_corroboration_count",
                                        sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("deposits", "independent_corroboration_count")
    op.drop_table("depositor_trust")
