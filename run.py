import argparse
import importlib
import yfinance as yf

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ticker', default='AAPL')
    parser.add_argument('--strategy', default='sma')  # Can be 'sma', 'rsi', etc.
    args = parser.parse_args()

    print(f"📊 Fetching data for {args.ticker}...")
    df = yf.download(args.ticker, period="7d", interval="1h")

    try:
        strategy_module = importlib.import_module(f"strategies.{args.strategy}")
        df = strategy_module.apply(df)
    except ModuleNotFoundError:
        print(f"❌ Strategy '{args.strategy}' not found.")
        return

    print(df[['Close', 'Signal', 'Position']].tail(10))

if __name__ == "__main__":
    main()
