import pandas as pd
import os
import matplotlib.pyplot as plt

LOG_FILE = "logs/trade_log.csv"  # Fixed missing equals sign

def calculate_pnl(plot_equity=True):
    if not os.path.exists(LOG_FILE):
        print("❌ No trade log found.")
        return

    df = pd.read_csv(LOG_FILE)  # Removed colon at end
    df = df.sort_values("timestamp")

    position = None
    entry_price = 0
    equity = 0
    equity_curve = []
    dates = []

    for _, row in df.iterrows():  # Fixed typo: itterows() → iterrows()
        action = row["action"]
        price = row["price"]
        timestamp = row["timestamp"]

        if action == "BUY":
            position = "LONG"
            entry_price = price
        elif action == "SELL" and position == "LONG":
            pnl = price - entry_price
            equity += pnl
            equity_curve.append(equity)
            dates.append(timestamp)
            position = None

    total_trades = len(equity_curve)
    total_pnl = equity
    avg_pnl = total_pnl / total_trades if total_trades > 0 else 0

    print("📈 PnL Summary")
    print(f"Total Trades: {total_trades}")
    print(f"Total PnL: ${total_pnl:.2f}")
    print(f"Average PnL per Trade: ${avg_pnl:.2f}")

    if plot_equity and equity_curve:
        plt.figure(figsize=(10, 4))
        plt.plot(dates, equity_curve, marker='o', linestyle='-')
        plt.title("Equity Curve")
        plt.xlabel("Date")
        plt.ylabel("Equity ($)")
        plt.xticks(rotation=45)
        plt.grid(True)
        plt.tight_layout()
        plt.savefig("logs/equity_curve.png")
        print("📊 Equity curve saved to logs/equity_curve.png")
