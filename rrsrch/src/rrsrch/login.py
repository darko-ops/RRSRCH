"""`rrsrch-login` — pair this machine with an rrsrch.com account (device flow,
the same shape as Claude Code's login): print a short code, the user approves
it in their signed-in dashboard, we poll until a device token arrives, then
store credentials at ~/.rrsrch/credentials.json (0600).

stdlib only; no dependency on the engine. `rrsrch-login --logout` unpairs.
"""
from __future__ import annotations

import json
import os
import platform
import ssl
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

from .credentials import CREDENTIALS_PATH, load_credentials, save_credentials

ACCOUNT_URL = os.environ.get("RRSRCH_ACCOUNT_URL", "https://rrsrch.com")


def _ssl_context() -> ssl.SSLContext:
    # macOS framework Pythons often ship without root CAs wired up; prefer
    # certifi's bundle when present. Verification is NEVER disabled.
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def _post(path: str, body: dict) -> dict:
    req = urllib.request.Request(
        f"{ACCOUNT_URL}{path}", data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=30, context=_ssl_context()) as r:
        return json.loads(r.read())


def main() -> None:  # pragma: no cover — interactive CLI
    if "--logout" in sys.argv:
        if load_credentials():
            CREDENTIALS_PATH.unlink()
            print("Unpaired. (The device can also be revoked in the dashboard.)")
        else:
            print("Not paired.")
        return

    creds = load_credentials()
    if creds:
        print(f"Already paired as {creds['email']} "
              f"(device: {creds.get('device_name')}).")
        print("Run `rrsrch-login --logout` first to re-pair.")
        return

    device_name = f"{platform.node() or 'machine'} · rrsrch"
    try:
        start = _post("/api/device/start", {"device_name": device_name})
    except urllib.error.URLError as e:
        print(f"Could not reach {ACCOUNT_URL}: {e}")
        sys.exit(1)

    print("Pairing this machine with your rrsrch.com account.\n")
    print(f"  1. Open   {start['verification_uri']}")
    print(f"  2. Sign in and approve the code:  {start['user_code']}\n")
    print("Waiting for approval", end="", flush=True)

    deadline = time.time() + start.get("expires_in", 900)
    while time.time() < deadline:
        time.sleep(start.get("interval", 5))
        print(".", end="", flush=True)
        result = _post("/api/device/poll", {"device_code": start["device_code"]})
        if result.get("status") == "approved":
            save_credentials({
                "token": result["token"],
                "email": result["user"]["email"],
                "name": result["user"]["name"],
                "device_id": result.get("device_id"),
                "device_name": device_name,
                "account_url": ACCOUNT_URL,
                "paired_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            })
            print(f"\n\nPaired as {result['user']['email']}.")
            print(f"Credentials saved to {CREDENTIALS_PATH} (0600).")
            print("MCP deposits from this machine are now attributed to your account.")
            return
        if result.get("status") == "expired":
            print("\nCode expired — run rrsrch-login again.")
            sys.exit(1)
    print("\nTimed out — run rrsrch-login again.")
    sys.exit(1)


if __name__ == "__main__":  # pragma: no cover
    main()
