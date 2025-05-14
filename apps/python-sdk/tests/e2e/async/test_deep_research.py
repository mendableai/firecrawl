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
async def test_deep_research_async_simple():
    result = await app.deep_research("What is the capital of France?", max_urls=2)
    assert hasattr(result, "status")
    assert result.status == "completed"
    assert hasattr(result, "success")
    assert result.success
    assert hasattr(result, "data")
    assert result.data is not None
    assert any("Paris" in str(result.data) or "France" in str(result.data) for _ in [0])

@pytest.mark.asyncio
async def test_deep_research_async_all_params():
    result = await app.deep_research(
        "What are the latest advancements in AI?",
        max_depth=2,
        time_limit=60,
        max_urls=3,
        analysis_prompt="Summarize the most important recent AI advancements.",
        system_prompt="You are an expert AI researcher."
    )
    assert hasattr(result, "status")
    assert result.status == "completed"
    assert hasattr(result, "success")
    assert result.success
    assert hasattr(result, "data")
    assert hasattr(result, "activities")
    assert isinstance(result.activities, list)
    assert result.data is not None
    assert hasattr(result.data, "sources")
    assert isinstance(result.data.sources, list)
    assert hasattr(result.data, "final_analysis")
    assert isinstance(result.data.final_analysis, str) 