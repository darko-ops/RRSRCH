"""Account credentials for a paired instance (written by `rrsrch-login`).

Pairing is OPTIONAL and touches nothing in the matching/confidence/trust path:
its only effects are (a) deposits made through the MCP server without an
explicit `depositor` are attributed to the account handle instead of "local",
and (b) the read-only /whoami endpoint lets the rrsrch.com dashboard confirm
which account this instance belongs to.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

CREDENTIALS_PATH = Path(os.environ.get(
    "RRSRCH_CREDENTIALS", Path.home() / ".rrsrch" / "credentials.json"))


def load_credentials() -> dict[str, Any] | None:
    try:
        data = json.loads(CREDENTIALS_PATH.read_text())
        return data if isinstance(data, dict) and data.get("email") else None
    except (OSError, ValueError):
        return None


def save_credentials(data: dict[str, Any]) -> None:
    CREDENTIALS_PATH.parent.mkdir(parents=True, exist_ok=True)
    CREDENTIALS_PATH.write_text(json.dumps(data, indent=1))
    CREDENTIALS_PATH.chmod(0o600)


def default_depositor() -> str:
    """Account handle for attribution, or 'local' when unpaired."""
    creds = load_credentials()
    return creds["email"] if creds else "local"


def whoami() -> dict[str, Any]:
    """Read-only pairing status for the dashboard (never includes the token)."""
    creds = load_credentials()
    if not creds:
        return {"paired": False}
    return {"paired": True, "account_email": creds.get("email"),
            "account_name": creds.get("name"),
            "device_name": creds.get("device_name"),
            "paired_at": creds.get("paired_at")}
