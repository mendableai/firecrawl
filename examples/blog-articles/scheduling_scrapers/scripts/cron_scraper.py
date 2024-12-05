# cron_scraper.py
import sys
import logging
from datetime import datetime
from pathlib import Path
from firecrawl_scraper import save_firecrawl_news_data

# Set up logging
log_dir = Path("logs")
log_dir.mkdir(exist_ok=True)
log_file = log_dir / f"scraper_{datetime.now().strftime('%Y_%m')}.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.FileHandler(log_file), logging.StreamHandler(sys.stdout)],
)


def main():
    try:
        logging.info("Starting scraping job")
        filename = save_firecrawl_news_data()
        logging.info(f"Successfully saved data to {filename}")
    except Exception as e:
        logging.error(f"Scraping failed: {str(e)}", exc_info=True)


if __name__ == "__main__":
    main()
