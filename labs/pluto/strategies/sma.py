import pandas as pd

# strategies/sma_crossover.py

def sma_crossover_strategy(df):
    df['SMA_5'] = df['Close'].rolling(window=5).mean()
    df['SMA_20'] = df['Close'].rolling(window=20).mean()

    df['Signal'] = 0
    df.loc[df['SMA_5'] > df['SMA_20'], 'Signal'] = 1
    df.loc[df['SMA_5'] < df['SMA_20'], 'Signal'] = -1

    df['Position'] = df['Signal'].shift(1)
    return df

def apply(df):
    return sma_crossover_strategy(df)
