import asyncio
import time
from firecrawl_scraper import save_firecrawl_news_data


async def schedule_scraper(interval_hours: float = 1):
    """
    Schedule the scraper to run at specified intervals

    Args:
        interval_hours (float): Hours between each scrape (can be decimal for shorter periods)
    """
    while True:
        try:
            print(f"Starting scrape at {time.strftime('%Y-%m-%d %H:%M:%S')}")
            # Run the scraper
            filename = save_firecrawl_news_data()
            print(f"Data saved to {filename}")

        except Exception as e:
            print(f"Error during scraping: {e}")

        # Wait for the specified interval
        await asyncio.sleep(interval_hours * 20)  # Convert hours to seconds


async def main():
    # Create tasks for different scheduling intervals
    tasks = [
        schedule_scraper(interval_hours=1),  # Run every hour
        # Add more tasks with different intervals if needed
        # schedule_scraper(interval_hours=0.5),  # Run every 30 minutes
        # schedule_scraper(interval_hours=2),    # Run every 2 hours
    ]

    # Run all tasks concurrently
    await asyncio.gather(*tasks)


if __name__ == "__main__":
    # Run the async scheduler
    asyncio.run(main())
