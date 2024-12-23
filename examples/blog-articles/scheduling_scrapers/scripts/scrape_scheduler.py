import schedule
import time
from firecrawl_scraper import save_firecrawl_news_data

# Schedule the scraper to run every hour
schedule.every().hour.do(save_firecrawl_news_data)

while True:
    schedule.run_pending()
    time.sleep(1)
