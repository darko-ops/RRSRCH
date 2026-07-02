"""corroboration lifecycle: confidence anchor + retirement chain on deposits;
widen query_events.outcome for 'agreed'/'disagreed'.

Revision ID: 0002_corroboration
Revises: 0001_init
Create Date: 2026-07-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0002_corroboration"
down_revision = "0001_init"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("deposits", sa.Column("last_corroborated_at",
                                        sa.DateTime(timezone=True), nullable=True))
    op.add_column("deposits", sa.Column("corroboration_count", sa.Integer(),
                                        nullable=False, server_default="0"))
    op.add_column("deposits", sa.Column("retired_at",
                                        sa.DateTime(timezone=True), nullable=True))
    op.add_column("deposits", sa.Column("superseded_by",
                                        postgresql.UUID(as_uuid=True), nullable=True))
    # retrieval always filters retired deposits out — make that filter cheap.
    op.execute("CREATE INDEX ix_deposits_live ON deposits (id) WHERE retired_at IS NULL")
    op.alter_column("query_events", "outcome", type_=sa.String(16),
                    existing_type=sa.String(8), existing_nullable=False)


def downgrade() -> None:
    op.alter_column("query_events", "outcome", type_=sa.String(8),
                    existing_type=sa.String(16), existing_nullable=False)
    op.execute("DROP INDEX IF EXISTS ix_deposits_live")
    op.drop_column("deposits", "superseded_by")
    op.drop_column("deposits", "retired_at")
    op.drop_column("deposits", "corroboration_count")
    op.drop_column("deposits", "last_corroborated_at")
