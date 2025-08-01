import sys
import os
import pandas as pd

SIMULATE = True  # 🔁 Set to False to go live

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from data.market_data import (
    init_kraken_client,
    get_kraken_price,
    get_ohlc,
    place_order,
    get_wallet_state
)

from strategies.rsi import apply_rsi_strategy
from core.trade_logger import log_trade
from core.twitter_bot import post_trade_update


def main():
    k = init_kraken_client()
    xrp, usd = get_wallet_state(k)
    price = get_kraken_price("XRPUSD")
    print(f"💰 Portfolio: {xrp:.2f} XRP | ${usd:.2f} USD | XRP/USD = ${price:.4f}")

    # === 📈 Fetch Market Data ===
    ohlc_df = get_ohlc("XRPUSD", interval=15)
    signal = apply_rsi_strategy(ohlc_df)

    if not signal:
        print("📉 No trade signal right now.")
        return

    # === 🚦 Execute Trade Logic ===
    action = signal["action"].lower()

    if action == "sell" and xrp > 10:
        volume = xrp * 0.5  # Adjust sell size %
        place_order(pair="XRPUSD", type="sell", ordertype="market", volume=volume)
        print(f"🔻 Sold {volume:.2f} XRP for USD")

    elif action == "buy" and usd > 5:
        max_xrp = (usd / price) * 0.95  # buffer for slippage/fees
        place_order(pair="XRPUSD", type="buy", ordertype="market", volume=max_xrp)
        print(f"🔺 Bought {max_xrp:.2f} XRP using ${usd:.2f}")

    # === 📝 Logging + Updates ===
    trade = {
        "timestamp": signal["timestamp"],
        "symbol": "XRP",
        "action": signal["action"],
        "price": signal["price"],
        "rsi": signal.get("rsi")
    }

    log_trade(**trade)

    rsi_text = f"RSI: {trade['rsi']:.2f} | " if trade["rsi"] else ""
    message = (
        f"{trade['action']} signal for ${trade['symbol']} at ${trade['price']:.2f}\n"
        f"{rsi_text}Time: {trade['timestamp']}"
    )
    post_trade_update(message)


if __name__ == "__main__":
    main()
