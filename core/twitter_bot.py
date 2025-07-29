import os
import tweepy
from dotenv import load_dotenv

load_dotenv()

def init_twitter_client():
    auth = tweepy.OAuth1UserHandler(
        os.getenv("TWITTER_API_KEY"),
        os.getenv("TWITTER_API_SECRET"),
        os.getenv("TWITTER_ACCESS_TOKEN"), 
        os.getenv("TWITTER_ACCESS_SECRET")
    )
    return tweepy.API(auth)

def post_trade_update(message: str):
    try:
        client = init_twitter_client()
        client.update_status(status=message)
        print("🐦 Trade posted to Twitter.")
    except Exception as e:
        print(f"⚠️ Twitter post failed: {e}")
