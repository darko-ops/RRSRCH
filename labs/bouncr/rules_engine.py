# labs/bouncr/rules_engine.py

import yaml
from datetime import datetime, timedelta, timezone
from typing import List, Tuple
from models.access_item import AccessItem

# Load the MCP config from config.yaml
def load_config(path: str = "labs/bouncr/config.yaml") -> dict:
    with open(path, "r") as f:
        config = yaml.safe_load(f)
    return config["mcp"]

# Evaluate each AccessItem against MCP rules
def evaluate_access(access_items: List[AccessItem]) -> List[Tuple[AccessItem, List[str]]]:
    config = load_config()
    flagged = []

    now_utc = datetime.now(timezone.utc)  # ✅ timezone-aware

    for item in access_items:
        reasons = []

        # Rule 1: Inactivity
        inactivity_days = config["review_thresholds"]["inactivity_days"]
        if (now_utc - item.last_login).days > inactivity_days:
            reasons.append(f"Inactive for more than {inactivity_days} days")

        # Rule 2: Privileged role
        if item.is_privileged and item.group in config["risky_roles"]:
            reasons.append(f"Privileged role: {item.group}")

        # Rule 3: Orphaned account (mock)
        if config["review_thresholds"].get("orphaned_account", False):
            if item.group == "engineering" and item.user_email.startswith("alex"):  # mock condition
                reasons.append("Possibly orphaned access (mock rule)")

        if reasons:
            flagged.append((item, reasons))

    return flagged
