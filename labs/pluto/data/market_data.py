import os
import krakenex
from pykrakenapi import KrakenAPI
from dotenv import load_dotenv

# Load API credentials from .env
load_dotenv()

print("🔐 Loaded API key:", os.getenv("KRAKEN_API_KEY")[:6], "...")

# === 🔐 Initialize Kraken Client ===
def init_kraken_client():
    key = os.getenv("KRAKEN_API_KEY")
    secret = os.getenv("KRAKEN_API_SECRET")

    if not key or not secret:
        raise RuntimeError("Missing Kraken API credentials. Check your .env file.")

    api = krakenex.API(key, secret)
    return KrakenAPI(api)


# === 💰 Portfolio Functions ===
def get_xrp_balance(k: KrakenAPI):
    balance = k.get_account_balance()
    return float(balance.loc["XXRP"]["vol"]) if "XXRP" in balance.index else 0.0


# === 📈 Price Functions ===
def get_kraken_price(symbol_pair="XRPUSD"):
    k = init_kraken_client()
    ticker = k.get_ticker_information(symbol_pair)
    return float(ticker["c"].iloc[0][0])  # safely extract the first close price


def get_ohlc(symbol="XRPUSD", interval=15):
    k = init_kraken_client()
    ohlc_df, _ = k.get_ohlc_data(symbol, interval=interval)
    return ohlc_df

def get_wallet_state(k: KrakenAPI):
    balance = k.get_account_balance()
    xrp = float(balance.get("XXRP", {}).get("vol", 0))
    usd = float(balance.get("ZUSD", {}).get("vol", 0))
    return xrp, usd


def place_order(pair="XRPUSD", type="buy", ordertype="market", volume=10.0, simulate=True):
    if simulate:
        print(f"🤖 [SIMULATION] Would place {type.upper()} {volume:.2f} {pair} as a {ordertype} order.")
        return {"status": "simulated", "type": type, "volume": volume, "pair": pair}

    k = init_kraken_client()
    response = k.add_standard_order(
        pair=pair,
        type=type,
        ordertype=ordertype,
        volume=str(volume)
    )
    print("🚀 Order placed:", response)
    return response
