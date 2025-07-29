import pandas as pd

def apply_rsi_strategy(df, period=14):
    df = df.copy()
    delta = df['Close'].diff()
    gain = delta.where(delta > 0, 0).rolling(window=period).mean()
    loss = -delta.where(delta < 0, 0).rolling(window=period).mean()
    rs = gain / loss
    df['RSI'] = 100 - (100 / (1 + rs))

    # Generate signals based on RSI
    df['Signal'] = 0
    df.loc[df['RSI'] < 30, 'Signal'] = 1  # Buy signal when RSI < 30 (oversold)
    df.loc[df['RSI'] > 70, 'Signal'] = -1  # Sell signal when RSI > 70 (overbought)
    
    # Position is the previous signal
    df['Position'] = df['Signal'].shift(1)
    
    return df

def apply(df):
    return apply_rsi_strategy(df)


def apply_rsi_strategy(df, period=14):
    # Must use df['close']
    delta = df['close'].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / loss
    df['RSI'] = 100 - (100 / (1 + rs))

    latest = df.iloc[-1]
    signal = None

    if latest['RSI'] < 30:
        signal = {'action': 'BUY', 'price': latest['close'], 'rsi': latest['RSI'], 'timestamp': latest.name}
    elif latest['RSI'] > 70:
        signal = {'action': 'SELL', 'price': latest['close'], 'rsi': latest['RSI'], 'timestamp': latest.name}

    return signal
