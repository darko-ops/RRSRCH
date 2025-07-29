import sys
import os
import streamlit as st
import matplotlib.pyplot as plt
from streamlit_autorefresh import st_autorefresh

# Add project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from data.market_data import init_kraken_client, get_wallet_state, get_kraken_price, get_ohlc
from strategies.rsi import apply_rsi_strategy
from data.xaman_wallet import get_xaman_wallet_balance
from core.portfolio_logger import log_portfolio_snapshot

# === 🔄 Auto-refresh every 60 sec
st_autorefresh(interval=60 * 1000, key="refresh")

# === 🖥️ Page settings
st.set_page_config(page_title="🧠 XRP Bot Dashboard", layout="wide")
st.title("🧠 XRP Compounding Bot Dashboard")

# === 🪙 Load Xaman Wallet Balance
xaman_address = "r953GDacxLWpemZNW72byT1E2ZL8RAZuti"
xaman_balance = get_xaman_wallet_balance(xaman_address)

# === 📡 Fetch Kraken data
k = init_kraken_client()
xrp, usd = get_wallet_state(k)
price = get_kraken_price("XRPUSD")
ohlc_df = get_ohlc("XRPUSD")
signal = apply_rsi_strategy(ohlc_df)

# === 🧠 Metrics
rsi = ohlc_df["RSI"].iloc[-1] if "RSI" in ohlc_df.columns else None
kraken_total = xrp + (usd / price if price > 0 else 0)
combined_total = kraken_total + (xaman_balance or 0)

# === 📋 Log
log_portfolio_snapshot(xrp, usd, price, rsi, xaman_balance)

# === 🧾 Display Metrics
st.metric("XRP Balance", f"{xrp:.2f} XRP")
st.metric("USD Balance", f"${usd:.2f}")
st.metric("XRP/USD Price", f"${price:.4f}")
st.metric("RSI (15min)", f"{rsi:.2f}" if rsi else "N/A")
st.metric("Total XRP-Equivalent", f"{kraken_total:.2f} XRP")

if xaman_balance is not None:
    st.metric("🪙 Xaman Wallet XRP", f"{xaman_balance:.2f} XRP")
else:
    st.warning("Unable to load Xaman wallet balance.")

st.metric("📦 Total XRP (Kraken + Xaman)", f"{combined_total:.2f} XRP")

# === 💡 Trade Signal
if signal:
    st.success(f"💡 Trade Signal: {signal['action']} @ ${signal['price']:.4f} | RSI: {signal['rsi']:.2f}")
else:
    st.info("No active trade signal.")

# === 📊 Chart
st.subheader("📈 Price and RSI over time")

if "RSI" in ohlc_df.columns:
    fig, ax1 = plt.subplots(figsize=(10, 4))
    ax1.set_title("XRP/USD Price and RSI")
    ax1.set_xlabel("Time")
    ax1.set_ylabel("Price (USD)", color="blue")
    ax1.plot(ohlc_df.index, ohlc_df["close"], color="blue", label="Price")
    ax1.tick_params(axis="y", labelcolor="blue")

    ax2 = ax1.twinx()
    ax2.set_ylabel("RSI", color="orange")
    ax2.plot(ohlc_df.index, ohlc_df["RSI"], color="orange", label="RSI")
    ax2.axhline(70, color="red", linestyle="--", linewidth=1)
    ax2.axhline(30, color="green", linestyle="--", linewidth=1)
    ax2.tick_params(axis="y", labelcolor="orange")

    fig.tight_layout()
    st.pyplot(fig)
else:
    st.warning("RSI data not available for chart.")
