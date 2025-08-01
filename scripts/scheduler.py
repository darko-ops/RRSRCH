import schedule
import time
from main import run_bot

def job():
    print("\\n Running scheduled bot job...")
    run_bot()

schedule.every(1).hours.do(job)

print("Scheduler started. Bot will run every hour")
job()

while True: 
    schedule.run_pending()
    time.sleep(10)
    