# labs/bouncr/utils/cache.py

import os, json, time
from typing import Dict

CACHE_PATH = "labs/bouncr/cache/app_user_map.json"
TTL_SECONDS = 86400  # 24 hours

def load_app_user_cache() -> Dict[str, list] | None:
    if not os.path.exists(CACHE_PATH):
        return None
    if time.time() - os.path.getmtime(CACHE_PATH) > TTL_SECONDS:
        print("⚠️ App-user cache is stale, refetching...")
        return None
    try:
        with open(CACHE_PATH, "r") as f:
            return json.load(f)
    except Exception as e:
        print(f"❌ Failed to read cache: {e}")
        return None

def save_app_user_cache(data: dict):
    os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
    with open(CACHE_PATH, "w") as f:
        json.dump(data, f)
