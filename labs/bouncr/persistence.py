import sqlite3
from pathlib import Path
from typing import List, Tuple
from models.access_item import AccessItem

DB_PATH = Path(__file__).resolve().parent / "bouncr.db"

def persist_flagged_reviews(flagged_items: List[Tuple[AccessItem, List[str]]]):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    for item, reasons in flagged_items:
        cursor.execute("""
            INSERT INTO reviews (timestamp, user_email, app, group_name, last_login, reasons, status)
            VALUES (datetime('now'), ?, ?, ?, ?, ?, 'pending')
        """, (
            item.user_email,
            item.app,
            item.group,
            item.last_login.strftime('%Y-%m-%d'),
            "; ".join(reasons)
        ))
    conn.commit()
    conn.close()
    print(f"💾 {len(flagged_items)} access items saved for review.")
