import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent.parent))

# labs/bouncr/bouncr_weekly.py

from bouncr.okta_client import fetch_access_data
from bouncr.rules_engine import evaluate_access
from bouncr.persistence import persist_flagged_reviews
from bouncr.notifications import notify_reviewers

def run_weekly_review():
    print("🔁 Running scheduled Bouncr audit...")

    # Fetch data from Okta
    access_data = fetch_access_data()

    # Evaluate access against MCP rules
    flagged_items = evaluate_access(access_data)

    # Save flagged items to persistent store
    persist_flagged_reviews(flagged_items)

    # Only notify if there's something to review
    if flagged_items:
        notify_reviewers(flagged_items, method="email")
    else:
        print("✅ No users required notification.")

if __name__ == "__main__":
    run_weekly_review()

