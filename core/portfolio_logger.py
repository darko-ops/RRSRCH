import csv
from datetime import datetime
import os

LOG_FILE = "reports/portfolio_log.csv"

def log_portfolio_snapshot(xrp, usd, price, rsi, xaman_balance):
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    now = datetime.utcnow().isoformat()

    with open(LOG_FILE, "a", newline="") as csvfile:
        writer = csv.writer(csvfile)
        if csvfile.tell() == 0:
            writer.writerow(["timestamp", "xrp", "usd", "price", "rsi", "xaman_balance"])
        writer.writerow([now, xrp, usd, price, rsi, xaman_balance])
