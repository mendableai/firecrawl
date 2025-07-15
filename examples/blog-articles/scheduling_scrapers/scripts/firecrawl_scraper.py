# firecrawl_scraper.py
import json
from firecrawl import FirecrawlApp
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from typing import List
from datetime import datetime

load_dotenv()

BASE_URL = "https://news.ycombinator.com/"


class NewsItem(BaseModel):
    title: str = Field(description="The title of the news item")
    source_url: str = Field(description="The URL of the news item")
    author: str = Field(
        description="The URL of the post author's profile concatenated with the base URL."
    )
    rank: str = Field(description="The rank of the news item")
    upvotes: str = Field(description="The number of upvotes of the news item")
    date: str = Field(description="The date of the news item.")


class NewsData(BaseModel):
    news_items: List[NewsItem]


def get_firecrawl_news_data():
    app = FirecrawlApp()

    data = app.scrape_url(
        BASE_URL,
        params={
            "formats": ["extract"],
            "extract": {"schema": NewsData.model_json_schema()},
        },
    )

    return data


def save_firecrawl_news_data():
    """
    Save the scraped news data to a JSON file with the current date in the filename.
    """
    # Get the data
    data = get_firecrawl_news_data()
    # Format current date for filename
    date_str = datetime.now().strftime("%Y_%m_%d_%H_%M")
    filename = f"firecrawl_hacker_news_data_{date_str}.json"

    # Save the news items to JSON file
    with open(filename, "w") as f:
        json.dump(data["extract"]["news_items"], f, indent=4)

    return filename


if __name__ == "__main__":
    save_firecrawl_news_data()
