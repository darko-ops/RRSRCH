"""deposits.derivation_tokens — the MEASURED token cost of producing the claim,
reported by the depositor. When present, a later hit's savings is computed from
this measured cost instead of the configured cold-path assumption."""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0007_derivation_tokens"
down_revision = "0006_attestation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("deposits", sa.Column("derivation_tokens", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("deposits", "derivation_tokens")
