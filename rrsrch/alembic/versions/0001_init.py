"""init: pgvector extension + deposits, query_events, corroborations

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

    op.create_table(
        "deposits",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("query_text", sa.Text(), nullable=False),
        sa.Column("query_embedding", Vector(EMBED_DIM), nullable=False),
        sa.Column("claim", sa.Text(), nullable=False),
        sa.Column("sources", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("scope", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("volatility", sa.String(16), nullable=False),
        sa.Column("depositor", sa.String(256), nullable=False),
        sa.Column("base_confidence", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_corroborated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("corroboration_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("disagreement_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("retired", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("superseded_by", postgresql.UUID(as_uuid=True), nullable=True),
    )
    # cosine ANN index over the embedding.
    op.execute(
        "CREATE INDEX ix_deposits_embedding ON deposits "
        "USING hnsw (query_embedding vector_cosine_ops)"
    )
    op.create_index("ix_deposits_retired", "deposits", ["retired"])

    op.create_table(
        "query_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("ts", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("query_text", sa.Text(), nullable=False),
        sa.Column("outcome", sa.String(8), nullable=False),
        sa.Column("matched_deposit_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("similarity", sa.Float(), nullable=True),
        sa.Column("confidence_at_serve", sa.Float(), nullable=True),
        sa.Column("tokens_saved_estimate", sa.Integer(), nullable=True),
        sa.Column("tokens_spent_estimate", sa.Integer(), nullable=True),
        sa.Column("volatility", sa.String(16), nullable=True),
    )

    op.create_table(
        "corroborations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("deposit_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("agreed", sa.Boolean(), nullable=False),
        sa.Column("fresh_claim_hash", sa.Text(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("corroborations")
    op.drop_table("query_events")
    op.drop_index("ix_deposits_retired", table_name="deposits")
    op.drop_index("ix_deposits_embedding", table_name="deposits")
    op.drop_table("deposits")
