import os
import yaml
import requests
from datetime import datetime
from dotenv import load_dotenv

from models.access_item import AccessItem
from utils.cache import load_app_user_cache, save_app_user_cache

load_dotenv()

# Load config
with open("labs/bouncr/config.yaml") as f:
    CONFIG = yaml.safe_load(f)["mcp"]
RISKY_ROLES = CONFIG.get("risky_roles", [])
IGNORE_GROUPS = CONFIG.get("ignore_groups", [])
IGNORE_APPS = CONFIG.get("ignore_apps", [])


def fetch_user_app_assignments_live(domain: str, headers: dict, ignore_apps: list[str]) -> dict:
    print("🔄 Fetching app-user assignments from Okta...")
    user_app_map = {}

    apps_resp = requests.get(f"{domain}/api/v1/apps", headers=headers)
    apps_resp.raise_for_status()
    apps = apps_resp.json()

    for app in apps:
        app_name = app.get("label", "Unknown App")
        app_id = app.get("id")
        if app_name.lower() in [a.lower() for a in ignore_apps]:
            continue

        assignments_resp = requests.get(f"{domain}/api/v1/apps/{app_id}/users", headers=headers)
        if assignments_resp.status_code != 200:
            print(f"⚠️ Failed to fetch assignments for {app_name}")
            continue

        assignments = assignments_resp.json()
        for assignment in assignments:
            uid = assignment["id"]
            user_app_map.setdefault(uid, []).append(app_name)

    return user_app_map


def fetch_access_data():
    print("🌐 Fetching real access data from Okta...")
    domain = os.getenv("OKTA_DOMAIN")
    token = os.getenv("OKTA_API_TOKEN")

    headers = {
        "Authorization": f"SSWS {token}",
        "Accept": "application/json"
    }

    # Use cache or fetch fresh app-user map
    user_app_map = load_app_user_cache()
    if not user_app_map or os.getenv("FORCE_REFRESH") == "1":
        user_app_map = fetch_user_app_assignments_live(domain, headers, IGNORE_APPS)
        save_app_user_cache(user_app_map)

    # Get users
    users_resp = requests.get(f"{domain}/api/v1/users", headers=headers)
    users_resp.raise_for_status()
    users = users_resp.json()

    access_items = []

    for user in users:
        user_id = user["id"]
        email = user["profile"]["email"]
        last_login_str = user.get("lastLogin") or user.get("lastUpdated") or datetime.now().isoformat()
        last_login = datetime.fromisoformat(last_login_str.replace("Z", "+00:00"))
        apps_for_user = user_app_map.get(user_id, ["Okta"])  # fallback if none found

        # Get group assignments
        groups_resp = requests.get(f"{domain}/api/v1/users/{user_id}/groups", headers=headers)
        groups_resp.raise_for_status()
        groups = groups_resp.json()

        for group in groups:
            group_name = group["profile"]["name"]
            if group_name.lower() in [g.lower() for g in IGNORE_GROUPS]:
                continue

            is_privileged = any(risky.lower() in group_name.lower() for risky in RISKY_ROLES)

            for app_name in apps_for_user:
                access_items.append(AccessItem(
                    user_id=user_id,
                    user_email=email,
                    app=app_name,
                    group=group_name,
                    last_login=last_login,
                    is_privileged=is_privileged
                ))

    return access_items
