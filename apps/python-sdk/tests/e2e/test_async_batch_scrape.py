import os
import pytest
from dotenv import load_dotenv
from firecrawl import FirecrawlApp

load_dotenv()

API_URL = "https://api.firecrawl.dev"
API_KEY = os.getenv("TEST_API_KEY")

app = FirecrawlApp(api_url=API_URL, api_key=API_KEY)

def test_async_batch_scrape_urls_placeholder():
    # TODO: Implement E2E tests for async_batch_scrape_urls
    assert True 