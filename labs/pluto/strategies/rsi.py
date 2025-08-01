import pandas as pd

def apply_rsi_strategy(df, period=14):
    df = df.copy()
    delta = df['close'].diff()
    gain = delta.where(delta > 0, 0).rolling(window=period).mean()
    loss = -delta.where(delta < 0, 0).rolling(window=period).mean()
    rs = gain / loss
    df['RSI'] = 100 - (100 / (1 + rs))

    # Signal for backtesting/visualization
    df['Signal'] = 0
    df.loc[df['RSI'] < 30, 'Signal'] = 1   # Buy
    df.loc[df['RSI'] > 70, 'Signal'] = -1  # Sell
    df['Position'] = df['Signal'].shift(1)

    return df

def get_latest_rsi_signal(df, period=14):
    df = apply_rsi_strategy(df, period)
    latest = df.iloc[-1]
    if latest['RSI'] < 30:
        return {
            'action': 'BUY',
            'price': latest['close'],
            'rsi': latest['RSI'],
            'timestamp': latest.name
        }
    elif latest['RSI'] > 70:
        return {
            'action': 'SELL',
            'price': latest['close'],
            'rsi': latest['RSI'],
            'timestamp': latest.name
        }
    return None
