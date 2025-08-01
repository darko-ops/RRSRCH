import sqlite3
from pathlib import Path
from typing import List
from models.access_item import AccessItem
from datetime import datetime

DB_PATH = Path(__file__).resolve().parent / "bouncr.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            user_email TEXT,
            app TEXT,
            group_name TEXT,
            last_login TEXT,
            reasons TEXT,
            status TEXT DEFAULT 'pending'
        )
    ''')
    conn.commit()
    conn.close()

def log_flagged_item(item: AccessItem, reasons: List[str]):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO reviews (timestamp, user_email, app, group_name, last_login, reasons)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (
        datetime.utcnow().isoformat(),
        item.user_email,
        item.app,
        item.group,
        item.last_login.isoformat(),
        ", ".join(reasons),
    ))
    conn.commit()
    conn.close()

def fetch_pending_reviews():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM reviews WHERE status = 'pending'")
    rows = cursor.fetchall()
    conn.close()
    return rows
