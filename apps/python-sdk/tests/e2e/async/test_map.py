import sys
import os
import subprocess
import time
import pytest
from dotenv import load_dotenv

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../')))
from firecrawl.firecrawl import AsyncFirecrawlApp

load_dotenv()

API_URL = os.getenv("TEST_API_URL") or "http://localhost:3002"
API_KEY = os.getenv("TEST_API_KEY")

app = AsyncFirecrawlApp(api_url=API_URL, api_key=API_KEY)

TEST_URL = "example.com"

@pytest.mark.asyncio
async def test_map_url_async_simple():
    result = await app.map_url(TEST_URL)
    assert result is not None
    assert result.success
    assert hasattr(result, "links")
    assert any("example.com" in url for url in result.links)

@pytest.mark.asyncio
async def test_map_url_async_all_params():
    result = await app.map_url(
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