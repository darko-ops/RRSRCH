"""Phase 1: topic_state table (bandit), deposits.topic_id, query_events audit fields.

Revision ID: 0003_exploration
Revises: 0002_corroboration
Create Date: 2026-07-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision = "0003_exploration"
down_revision = "0002_corroboration"
branch_labels = None
depends_on = None
EMBED_DIM = 384


def upgrade() -> None:
    op.create_table(
        "topic_state",
        sa.Column("topic_id", sa.String(64), primary_key=True),
        sa.Column("scope_key", sa.Text(), nullable=False),
        sa.Column("centroid", Vector(EMBED_DIM), nullable=False),
        sa.Column("base_volatility", sa.String(16), nullable=False),
        sa.Column("exploration_rate", sa.Float(), nullable=False),
        sa.Column("agreement_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("disagreement_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("observed_volatility", sa.String(16), nullable=True),
        sa.Column("half_life_factor", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_topic_state_scope_key", "topic_state", ["scope_key"])

    op.add_column("deposits", sa.Column("topic_id", sa.String(64), nullable=True))
    op.create_index("ix_deposits_topic_id", "deposits", ["topic_id"])
    # recall feed: "what retired since T?"
    op.execute("CREATE INDEX ix_deposits_retired_at ON deposits (retired_at) "
               "WHERE retired_at IS NOT NULL")

    op.add_column("query_events", sa.Column("topic_id", sa.String(64), nullable=True))
    op.create_index("ix_query_events_topic_id", "query_events", ["topic_id"])
    op.add_column("query_events", sa.Column("detail", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("query_events", "detail")
    op.drop_index("ix_query_events_topic_id", table_name="query_events")
    op.drop_column("query_events", "topic_id")
    op.execute("DROP INDEX IF EXISTS ix_deposits_retired_at")
    op.drop_index("ix_deposits_topic_id", table_name="deposits")
    op.drop_column("deposits", "topic_id")
    op.drop_index("ix_topic_state_scope_key", table_name="topic_state")
    op.drop_table("topic_state")
