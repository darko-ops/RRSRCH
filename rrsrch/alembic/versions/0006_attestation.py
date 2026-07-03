"""Phase 3: attestation — deposits.attestation (opaque token, audit) and
depositor_trust.attested_level (highest verified level; NULL = unattested =
exact Phase 2 behavior, which is also the correct backfill for all history).

Revision ID: 0006_attestation
Revises: 0005_depositor_trust
Create Date: 2026-07-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0006_attestation"
down_revision = "0005_depositor_trust"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("deposits", sa.Column("attestation", sa.Text(), nullable=True))
    op.add_column("depositor_trust",
                  sa.Column("attested_level", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("depositor_trust", "attested_level")
    op.drop_column("deposits", "attestation")
