import sys
import os
import subprocess
import time
import pytest
from dotenv import load_dotenv

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../')))
from firecrawl.firecrawl import AsyncFirecrawlApp, JsonConfig, LocationConfig, ChangeTrackingOptions, WaitAction, ScreenshotAction, WriteAction, PressAction, ScrollAction, ExecuteJavascriptAction

load_dotenv()

API_URL = os.getenv("TEST_API_URL") or "http://localhost:3002"
API_KEY = os.getenv("TEST_API_KEY")

app = AsyncFirecrawlApp(api_url=API_URL, api_key=API_KEY)

TEST_URLS = [
    "https://example.com",
    "https://iana.org"
]

@pytest.mark.asyncio
async def test_batch_scrape_urls_async_simple():
    result = await app.batch_scrape_urls(
        TEST_URLS,
        formats=["markdown"]
    )
    assert result.success
    assert hasattr(result, "data")
    assert len(result.data) == len(TEST_URLS)
    assert any("Example Domain" in doc.markdown for doc in result.data)

@pytest.mark.asyncio
async def test_batch_scrape_urls_async_all_params_with_extract():
    location = LocationConfig(country="us", languages=["en"])
    extract_schema = {"type": "object", "properties": {"title": {"type": "string"}}}
    extract = JsonConfig(prompt="Extract the title", schema=extract_schema)
    actions = [
        WaitAction(type="wait", milliseconds=500),
        ScreenshotAction(type="screenshot", fullPage=True),
        WriteAction(type="write", text="test input"),
        PressAction(type="press", key="Enter"),
        ScrollAction(type="scroll", direction="down"),
        ExecuteJavascriptAction(type="execute_javascript", script="function get_title() { return document.title; }; get_title();")
    ]
    result = await app.batch_scrape_urls(
        TEST_URLS,
        formats=["markdown", "html", "raw_html", "links", "screenshot", "extract"],
        include_tags=["h1", "p"],
        exclude_tags=["footer"],
        only_main_content=True,
        wait_for=1000,
        timeout=15000,
        location=location,
        mobile=True,
        skip_tls_verification=True,
        remove_base64_images=True,
        block_ads=True,
        proxy="basic",
        extract=extract,
        actions=actions
    )
    assert result.success
    assert hasattr(result, "data")

    assert len(result.data) == len(TEST_URLS)
    for doc in result.data:
        assert hasattr(doc, "markdown")
        assert hasattr(doc, "html")
        assert hasattr(doc, "raw_html")
        assert hasattr(doc, "links")
        assert hasattr(doc, "screenshot")
        assert hasattr(doc, "extract")
        assert hasattr(doc, "metadata")

@pytest.mark.asyncio
async def test_batch_scrape_urls_async_all_params_with_json_options():
    location = LocationConfig(country="us", languages=["en"])
    json_schema = {"type": "object", "properties": {"title": {"type": "string"}}}
    json_options = JsonConfig(prompt="Extract the title as JSON", schema=json_schema)
    actions = [
        WaitAction(type="wait", milliseconds=500),
        ScreenshotAction(type="screenshot", fullPage=True),
        WriteAction(type="write", text="test input"),
        PressAction(type="press", key="Enter"),
        ScrollAction(type="scroll", direction="down"),
        ExecuteJavascriptAction(type="execute_javascript", script="function get_title() { return document.title; }; get_title();")
    ]
    result = await app.batch_scrape_urls(
        TEST_URLS,
        formats=["markdown", "html", "raw_html", "links", "screenshot", "json"],
        include_tags=["h1", "p"],
        exclude_tags=["footer"],
        only_main_content=True,
        wait_for=1000,
        timeout=15000,
        location=location,
        mobile=True,
        skip_tls_verification=True,
        remove_base64_images=True,
        block_ads=True,
        proxy="basic",
        json_options=json_options,
        actions=actions
    )
    assert result.success
    assert hasattr(result, "data")
    assert len(result.data) == len(TEST_URLS)
    for doc in result.data:
        assert hasattr(doc, "markdown")
        assert hasattr(doc, "html")
        assert hasattr(doc, "raw_html")
        assert hasattr(doc, "links")
        assert hasattr(doc, "screenshot")
        assert hasattr(doc, "json")
        assert hasattr(doc, "metadata") 