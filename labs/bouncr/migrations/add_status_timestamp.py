import sqlite3
from pathlib import Path

# Adjust the path to point to bouncr.db correctly
DB_PATH = Path(__file__).resolve().parent.parent / "bouncr.db"

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("ALTER TABLE reviews ADD COLUMN status_updated_at TEXT")
        print("✅ Migration complete: Added 'status_updated_at' column.")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e).lower():
            print("ℹ️ Column already exists.")
        else:
            raise
    finally:
        conn.commit()
        conn.close()

if __name__ == "__main__":
    migrate()
