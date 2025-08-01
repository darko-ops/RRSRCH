import sqlite3
from pathlib import Path
from datetime import datetime

DB_PATH = Path(__file__).resolve().parent / "bouncr.db"

def list_pending_reviews():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, timestamp, user_email, app, group_name, reasons FROM reviews WHERE status = 'pending'")
    rows = cursor.fetchall()
    conn.close()
    return rows

def update_status(review_id, new_status):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE reviews 
        SET status = ?, status_updated_at = ? 
        WHERE id = ?
    """, (new_status, datetime.utcnow().isoformat(), review_id))
    conn.commit()
    conn.close()

def main():
    pending = list_pending_reviews()

    if not pending:
        print("✅ No pending access reviews.")
        return

    print(f"📝 {len(pending)} access item(s) require review:\n")

    for row in pending:
        id, timestamp, email, app, group, reasons = row
        print(f"[{id}] {email} - {app} / {group}")
        print(f"     ⏱️  {timestamp}")
        print(f"     ⚠️  {reasons}")
        action = input("→ Approve (a) / Reject (r) / Skip (Enter): ").strip().lower()

        if action == 'a':
            update_status(id, 'approved')
            print("✅ Approved.\n")
        elif action == 'r':
            update_status(id, 'rejected')
            print("❌ Rejected.\n")
        else:
            print("⏭️  Skipped.\n")

    print("✅ Review session complete.")

if __name__ == "__main__":
    main()
