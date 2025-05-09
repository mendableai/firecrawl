import os
import pytest
from dotenv import load_dotenv
from firecrawl import FirecrawlApp

load_dotenv()

API_URL = "https://api.firecrawl.dev"
API_KEY = os.getenv("TEST_API_KEY")

app = FirecrawlApp(api_url=API_URL, api_key=API_KEY)

def test_check_crawl_status_placeholder():
    # TODO: Implement E2E tests for check_crawl_status
    assert True 