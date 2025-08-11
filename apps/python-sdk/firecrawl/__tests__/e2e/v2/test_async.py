import os
import asyncio
import pytest
from dotenv import load_dotenv

from firecrawl import AsyncFirecrawl
from firecrawl.v2.types import Document


load_dotenv()

if not os.getenv("API_KEY"):
    raise ValueError("API_KEY is not set")

if not os.getenv("API_URL"):
    raise ValueError("API_URL is not set")


@pytest.mark.asyncio
async def test_async_scrape_minimal():
    client = AsyncFirecrawl(api_key=os.getenv("API_KEY"), api_url=os.getenv("API_URL"))
    doc = await client.v2.scrape("https://docs.firecrawl.dev")
    assert isinstance(doc, Document)
    # Accept any primary content or alternate outputs
    assert (
        (doc.markdown and len(doc.markdown) > 0)
        or (doc.html and len(doc.html) > 0)
        or (doc.raw_html and len(doc.raw_html) > 0)
        or (doc.links is not None)
        or (doc.screenshot is not None)
        or (doc.json is not None)
    )


@pytest.mark.asyncio
async def test_async_crawl_start_and_status():
    client = AsyncFirecrawl(api_key=os.getenv("API_KEY"), api_url=os.getenv("API_URL"))
    start = await client.v2.start_crawl("https://docs.firecrawl.dev", limit=2)
    job_id = start.id

    # Poll status until terminal or timeout
    deadline = asyncio.get_event_loop().time() + 180
    status = await client.v2.get_crawl_status(job_id)
    while status.status not in ("completed", "failed") and asyncio.get_event_loop().time() < deadline:
        await asyncio.sleep(2)
        status = await client.v2.get_crawl_status(job_id)

    assert status.status in ("completed", "failed")


@pytest.mark.asyncio
async def test_async_batch_start_and_status():
    client = AsyncFirecrawl(api_key=os.getenv("API_KEY"), api_url=os.getenv("API_URL"))
    start = await client.v2.start_batch_scrape([
        "https://docs.firecrawl.dev",
        "https://firecrawl.dev",
    ], formats=["markdown"], max_concurrency=1)
    job_id = start.id

    deadline = asyncio.get_event_loop().time() + 240
    status = await client.v2.get_batch_scrape_status(job_id)
    while status.status not in ("completed", "failed", "cancelled") and asyncio.get_event_loop().time() < deadline:
        await asyncio.sleep(2)
        status = await client.v2.get_batch_scrape_status(job_id)

    assert status.status in ("completed", "failed", "cancelled")


@pytest.mark.asyncio
async def test_async_usage_minimal():
    client = AsyncFirecrawl(api_key=os.getenv("API_KEY"), api_url=os.getenv("API_URL"))
    conc = await client.v2.get_concurrency()
    assert hasattr(conc, "concurrency") and hasattr(conc, "max_concurrency")

    credits = await client.v2.get_credit_usage()
    assert hasattr(credits, "remaining_credits")

    tokens = await client.v2.get_token_usage()
    assert hasattr(tokens, "total_tokens")

