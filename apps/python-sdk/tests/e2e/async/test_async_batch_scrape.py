import os
import pytest
from dotenv import load_dotenv
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../')))
from firecrawl.firecrawl import AsyncFirecrawlApp, JsonConfig, LocationConfig, WaitAction, ScreenshotAction, WriteAction, PressAction, ScrollAction, ExecuteJavascriptAction

load_dotenv()

API_URL = "https://api.firecrawl.dev"
API_KEY = os.getenv("TEST_API_KEY")

app = AsyncFirecrawlApp(api_url=API_URL, api_key=API_KEY)

TEST_URLS = [
    "https://firecrawl-e2e-test-git-main-rafaelsideguides-projects.vercel.app/actions",
    "https://firecrawl-e2e-test-git-main-rafaelsideguides-projects.vercel.app/numbered-pagination"
]


async def wait_for_batch_completion(app, job_id, timeout=60):
    for _ in range(timeout):
        status = await app.check_batch_scrape_status(job_id)
        if status.status == "completed":
            return status
        import time; time.sleep(1)
    raise TimeoutError("Batch scrape did not complete in time")

@pytest.mark.asyncio
async def test_async_batch_scrape_urls_simple():
    job = await app.async_batch_scrape_urls(
        TEST_URLS,
        formats=["markdown"]
    )
    assert job.id is not None
    status = await wait_for_batch_completion(app, job.id)
    
    # Basic response assertions
    assert status.success
    assert hasattr(status, "data")
    assert status.data is not None
    assert isinstance(status.data, list)
    assert len(status.data) == len(TEST_URLS)
    
    # Content assertions for each document
    for doc in status.data:
        assert hasattr(doc, "markdown")
        assert doc.markdown is not None
        assert isinstance(doc.markdown, str)
        assert len(doc.markdown) > 0
        
        assert hasattr(doc, "metadata")
        assert doc.metadata is not None
        assert isinstance(doc.metadata, dict)
        assert "url" in doc.metadata
        assert doc.metadata["url"] in TEST_URLS
    
    # Check that we got content from both test pages
    markdown_contents = [doc.markdown for doc in status.data]
    assert any("This page is used for end-to-end (e2e) testing with Firecrawl." in content for content in markdown_contents)
    assert any("Numbered Pagination" in content for content in markdown_contents)

@pytest.mark.asyncio
async def test_async_batch_scrape_urls_all_params_with_json_options():
    location = LocationConfig(country="us", languages=["en"])
    json_schema = {"type": "object", "properties": {"title": {"type": "string"}}}
    json_options = JsonConfig(prompt="Extract the title as JSON", schema=json_schema)
    actions = [
        WaitAction(milliseconds=500),
        ScreenshotAction(fullPage=True),
        WriteAction(text="test input"),
        PressAction(key="Enter"),
        ScrollAction(direction="down"),
        ExecuteJavascriptAction(script="function get_title() { return document.title; }; get_title();")
    ]
    job = await app.async_batch_scrape_urls(
        TEST_URLS,
        formats=["markdown", "html", "raw_html", "links", "screenshot", "json"],
        include_tags=["h1", "p"],
        exclude_tags=["footer"],
        only_main_content=True,
        wait_for=1000,
        timeout=30000,
        location=location,
        mobile=True,
        skip_tls_verification=True,
        remove_base64_images=True,
        block_ads=True,
        proxy="basic",
        json_options=json_options,
        actions=actions
    )
    assert job.id is not None
    status = await wait_for_batch_completion(app, job.id)
    
    # Basic response assertions
    assert status.success
    assert hasattr(status, "data")
    assert status.data is not None
    assert isinstance(status.data, list)
    assert len(status.data) == len(TEST_URLS)
    
    # Detailed content assertions for each document
    for doc in status.data:
        # Markdown assertions
        assert hasattr(doc, "markdown")
        assert doc.markdown is not None
        assert isinstance(doc.markdown, str)
        assert len(doc.markdown) > 0
        
        # HTML assertions
        assert hasattr(doc, "html")
        assert doc.html is not None
        assert isinstance(doc.html, str)
        assert len(doc.html) > 0
        
        # Raw HTML assertions
        assert hasattr(doc, "raw_html")
        assert doc.raw_html is not None
        assert isinstance(doc.raw_html, str)
        assert len(doc.raw_html) > 0
        
        # Links assertions
        assert hasattr(doc, "links")
        assert doc.links is not None
        assert isinstance(doc.links, list)
        
        # Screenshot assertions
        assert hasattr(doc, "screenshot")
        assert doc.screenshot is not None
        assert isinstance(doc.screenshot, str)
        assert doc.screenshot.startswith("https://")
        
        # JSON assertions
        assert hasattr(doc, "json")
        assert doc.json is not None
        assert isinstance(doc.json, dict)
        
        # Metadata assertions
        assert hasattr(doc, "metadata")
        assert doc.metadata is not None
        assert isinstance(doc.metadata, dict)
        assert "url" in doc.metadata
        assert doc.metadata["url"] in TEST_URLS

@pytest.mark.asyncio
async def test_async_batch_scrape_urls_all_params_with_json_options_full_page_screenshot():
    location = LocationConfig(country="us", languages=["en"])
    json_schema = {"type": "object", "properties": {"title": {"type": "string"}}}
    json_options = JsonConfig(prompt="Extract the title as JSON", schema=json_schema)
    actions = [
        WaitAction(milliseconds=500),
        ScreenshotAction(fullPage=True),
        WriteAction(text="test input"),
        PressAction(key="Enter"),
        ScrollAction(direction="down"),
        ExecuteJavascriptAction(script="function get_title() { return document.title; }; get_title();")
    ]
    job = await app.async_batch_scrape_urls(
        TEST_URLS,
        formats=["markdown", "html", "raw_html", "links", "screenshot@full_page", "json"],
        include_tags=["h1", "p"],
        exclude_tags=["footer"],
        only_main_content=True,
        wait_for=1000,
        timeout=30000,
        location=location,
        mobile=True,
        skip_tls_verification=True,
        remove_base64_images=True,
        block_ads=True,
        proxy="basic",
        json_options=json_options,
        actions=actions
    )
    assert job.id is not None
    status = await wait_for_batch_completion(app, job.id)
    
    # Basic response assertions
    assert status.success
    assert hasattr(status, "data")
    assert status.data is not None
    assert isinstance(status.data, list)
    assert len(status.data) == len(TEST_URLS)
    
    # Detailed content assertions for each document
    for doc in status.data:
        # Markdown assertions
        assert hasattr(doc, "markdown")
        assert doc.markdown is not None
        assert isinstance(doc.markdown, str)
        assert len(doc.markdown) > 0
        
        # HTML assertions
        assert hasattr(doc, "html")
        assert doc.html is not None
        assert isinstance(doc.html, str)
        assert len(doc.html) > 0
        
        # Raw HTML assertions
        assert hasattr(doc, "raw_html")
        assert doc.raw_html is not None
        assert isinstance(doc.raw_html, str)
        assert len(doc.raw_html) > 0
        
        # Links assertions
        assert hasattr(doc, "links")
        assert doc.links is not None
        assert isinstance(doc.links, list)
        
        # Screenshot assertions (full page)
        assert hasattr(doc, "screenshot")
        assert doc.screenshot is not None
        assert isinstance(doc.screenshot, str)
        assert doc.screenshot.startswith("https://")
        
        # JSON assertions
        assert hasattr(doc, "json")
        assert doc.json is not None
        assert isinstance(doc.json, dict)
        
        # Metadata assertions
        assert hasattr(doc, "metadata")
        assert doc.metadata is not None
        assert isinstance(doc.metadata, dict)
        assert "url" in doc.metadata
        assert doc.metadata["url"] in TEST_URLS 