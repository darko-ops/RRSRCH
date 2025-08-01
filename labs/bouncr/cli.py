# apps/bouncr/cli.py
# labs/bouncr/cli.py

import argparse
from pathlib import Path
import sys

# Add bouncr module to path (so we can import internal modules)
sys.path.append(str(Path(__file__).resolve().parent))

from okta_client import fetch_access_data
from rules_engine import evaluate_access
# from notifier import notify_reviewers  # You can uncomment once it's built

def main():
    parser = argparse.ArgumentParser(description="bouncr: Access Review Agent")
    parser.add_argument("--provider", default="okta", help="Identity provider to fetch access data from")
    parser.add_argument("--notify", choices=["slack", "email"], default="slack")
    args = parser.parse_args()

    print("🔐 Fetching access data...")
    access_data = fetch_access_data()

    print("🧠 Evaluating access with MCP rules...")
    flagged_items = evaluate_access(access_data)

    for item, reasons in flagged_items:
        print(f"⚠️  {item.user_email} flagged for review:")
        for reason in reasons:
            print(f"   - {reason}")

    # Uncomment when notifier is implemented
    # print(f"📨 Notifying reviewers via {args.notify}...")
    # notify_reviewers(flagged_items, method=args.notify)

    print("✅ Access review completed.")

if __name__ == "__main__":
    main()
