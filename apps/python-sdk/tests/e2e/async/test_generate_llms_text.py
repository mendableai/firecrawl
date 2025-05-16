import os
import sys
import pytest
from dotenv import load_dotenv

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../')))
from firecrawl.firecrawl import AsyncFirecrawlApp

load_dotenv()

API_URL = "https://api.firecrawl.dev"
API_KEY = os.getenv("TEST_API_KEY")

app = AsyncFirecrawlApp(api_url=API_URL, api_key=API_KEY)

@pytest.mark.asyncio
async def test_generate_llms_text_async_simple():
    result = await app.generate_llms_text("https://example.com")
    assert hasattr(result, "status")
    assert result.status == "completed"
    assert hasattr(result, "data")
    assert result.data is not None
    assert hasattr(result.data, "llmstxt")
    assert isinstance(result.data.llmstxt, str)
    assert len(result.data.llmstxt) > 0

@pytest.mark.asyncio
async def test_generate_llms_text_async_all_params():
    result = await app.generate_llms_text(
        "https://www.iana.org",
        max_urls=5,
        show_full_text=True,
        experimental_stream=True
    )
    assert hasattr(result, "status")
    assert result.status == "completed"
    assert hasattr(result, "data")
    assert result.data is not None
    assert hasattr(result.data, "llmstxt")
    assert isinstance(result.data.llmstxt, str)
    assert len(result.data.llmstxt) > 0
    assert hasattr(result.data, "llmsfulltxt")
    assert result.data.llmsfulltxt is None or isinstance(result.data.llmsfulltxt, str) 