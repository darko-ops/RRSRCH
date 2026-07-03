"""init: pgvector + pg_trgm, deposits, query_events

Revision ID: 0001_init
Revises:
Create Date: 2026-06-20
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision = "0001_init"
down_revision = None
branch_labels = None
depends_on = None
EMBED_DIM = 384


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.create_table(
        "deposits",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column("query_embedding", Vector(EMBED_DIM), nullable=False),
        sa.Column("claim", sa.Text(), nullable=False),
        sa.Column("sources", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("scope", postgresql.JSONB(), nullable=True),
        sa.Column("volatility", sa.String(16), nullable=False),
        sa.Column("depositor", sa.String(256), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    # vector ANN (cosine) + trigram GIN for lexical retrieval.
    op.execute("CREATE INDEX ix_deposits_embedding ON deposits USING hnsw (query_embedding vector_cosine_ops)")
    op.execute("CREATE INDEX ix_deposits_query_trgm ON deposits USING gin (query gin_trgm_ops)")

    op.create_table(
        "query_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("ts", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column("outcome", sa.String(8), nullable=False),
        sa.Column("reason", sa.String(40), nullable=True),
        sa.Column("similarity", sa.Float(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("tokens_saved_estimate", sa.Integer(), nullable=True),
        sa.Column("tokens_spent_estimate", sa.Integer(), nullable=True),
        sa.Column("served_deposit_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("volatility", sa.String(16), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("query_events")
    op.drop_index("ix_deposits_query_trgm", table_name="deposits")
    op.drop_index("ix_deposits_embedding", table_name="deposits")
    op.drop_table("deposits")
