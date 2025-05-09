import os
import pytest
from dotenv import load_dotenv
from firecrawl import AsyncFirecrawlApp

load_dotenv()

API_URL = "https://api.firecrawl.dev"
API_KEY = os.getenv("TEST_API_KEY")

app = AsyncFirecrawlApp(api_url=API_URL, api_key=API_KEY)

@pytest.mark.asyncio
async def test_extract_async_placeholder():
    # TODO: Implement async E2E tests for extract
    assert True 