import time
from datetime import datetime
import yaml

from data.market_data import init_kraken_client, get_wallet_state, get_kraken_price, get_ohlc
from strategies.rsi import get_latest_rsi_signal  # ← uses final signal function
from data.xaman_wallet import get_xaman_wallet_balance
from core.portfolio_logger import log_portfolio_snapshot
from core.trade_logger import log_trade  # Make sure this exists
from core.twitter_bot import tweet

# === ⚙️ Load config
with open("config.yaml", "r") as f:
    config = yaml.safe_load(f)

DRY_RUN = config.get("trading", {}).get("dry_run", True)
KRAKEN_PAIR = "XRPUSD"
XAMAN_ADDRESS = "r953GDacxLWpemZNW72byT1E2ZL8RAZuti"

# === 📦 Trading Logic
def place_trade(k, action, volume, price=None):
    if DRY_RUN:
        print(f"[SIMULATED {action}] {volume:.2f} XRP at ${price:.4f}")
        return {"simulated": True}

    try:
        order_type = "buy" if action == "BUY" else "sell"
        resp = k.add_standard_order(
            pair=KRAKEN_PAIR,
            type=order_type,
            ordertype="market",
            volume=str(volume)
        )
        return resp
    except Exception as e:
        print(f"❌ Trade error: {e}")
        return None

# === 🤖 Bot Runner
def run_bot():
    print(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Running XRP bot...")

    try:
        # 1. Connect
        k = init_kraken_client()
        xrp, usd = get_wallet_state(k)
        price = get_kraken_price(KRAKEN_PAIR)
        ohlc_df = get_ohlc(KRAKEN_PAIR)
        xaman_balance = get_xaman_wallet_balance(XAMAN_ADDRESS)

        # 2. Check RSI signal
        signal = get_latest_rsi_signal(ohlc_df)
        rsi = ohlc_df["RSI"].iloc[-1] if "RSI" in ohlc_df.columns else None

        # 3. Log current snapshot
        log_portfolio_snapshot(xrp, usd, price, rsi, xaman_balance)

        # 4. Evaluate and execute trade
        if signal:
            print(f"💡 Signal: {signal['action']} @ ${signal['price']:.4f} | RSI: {signal['rsi']:.2f}")

            if signal["action"] == "BUY" and usd > 5:
                volume = usd / price
                resp = place_trade(k, "BUY", volume, price)
                if resp:
                    log_trade("BUY", volume, price, "auto")
                    print(f"✅ Bought {volume:.2f} XRP")

            elif signal["action"] == "SELL" and xrp > 5:
                resp = place_trade(k, "SELL", xrp, price)
                if resp:
                    log_trade("SELL", xrp, price, "auto")
                    print(f"✅ Sold {xrp:.2f} XRP")

            else:
                print("⚠️ Not enough balance to execute trade.")
        else:
            print("ℹ️ No signal. Holding position.")

    except Exception as e:
        print(f"❌ Bot runtime error: {e}")

# === ⏱️ Entry point
if __name__ == "__main__":
    run_bot()
