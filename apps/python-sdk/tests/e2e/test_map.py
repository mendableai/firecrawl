import sys
import os
import pytest
from dotenv import load_dotenv

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))
from firecrawl.firecrawl import FirecrawlApp

load_dotenv()

API_URL = os.getenv("TEST_API_URL") or "http://localhost:3002"
API_KEY = os.getenv("TEST_API_KEY")

app = FirecrawlApp(api_url=API_URL, api_key=API_KEY)

TEST_URL = "example.com"

def test_map_url_simple():
    result = app.map_url(TEST_URL)
    assert result is not None
    assert result.success
    assert hasattr(result, "links")
    assert any("example.com" in url for url in result.links)

def test_map_url_all_params():
    result = app.map_url(
        TEST_URL,
        search="test",
        sitemap_only=False,
        include_subdomains=False,
        limit=10
    )
    assert result is not None
    assert result.success
    assert hasattr(result, "links")
    assert any("example.com" in url for url in result.links)