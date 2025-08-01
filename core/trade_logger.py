import os
import csv
from datetime import datetime

LOG_FILE = "logs/trade_log.csv"

def log_trade(timestamp, symbol, action, price, rsi):
    os.makedirs("logs", exist_ok=True)
    file_exists = os.path.isfile(LOG_FILE)

    with open(LOG_FILE, mode="a", newline="") as file:
        writer = csv.writer(file)
        if not file_exists:
            writer.writerow(["timestamp", "symbol", "action", "price", "RSI"])
        writer.writerow([timestamp, symbol, action, price, rsi])

