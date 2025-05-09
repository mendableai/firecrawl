import sys
import os
import subprocess
import time
import pytest
from dotenv import load_dotenv

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../')))
from firecrawl import AsyncFirecrawlApp, JsonConfig, LocationConfig, ChangeTrackingOptions
from firecrawl.firecrawl import WaitAction, ScreenshotAction, WriteAction, PressAction, ScrollAction, ExecuteJavascriptAction

load_dotenv()

API_URL = os.getenv("TEST_API_URL") or "http://localhost:3002"
API_KEY = os.getenv("TEST_API_KEY")

app = AsyncFirecrawlApp(api_url=API_URL, api_key=API_KEY)

TEST_URL = 'example.com'

@pytest.mark.asyncio
async def test_scrape_url_async_simple():
    response = await app.scrape_url(
        TEST_URL,
        formats=["markdown"]
    )
    assert response.success
    assert hasattr(response, "markdown")
    assert "# Example Domain" in response.markdown

@pytest.mark.asyncio
async def test_scrape_url_async_all_params_with_extract_screenshot():
    location = LocationConfig(country="us", languages=["en"])
    extract_schema = {"type": "object", "properties": {"title": {"type": "string"}}}
    extract = JsonConfig(prompt="Extract the title", schema=extract_schema)
    change_tracking = ChangeTrackingOptions(modes=["git-diff", "json"], prompt="Track changes", schema=extract_schema)
    actions = [
        WaitAction(type="wait", milliseconds=500),
        ScreenshotAction(type="screenshot", fullPage=True),
        WriteAction(type="write", text="test input"),
        PressAction(type="press", key="Enter"),
        ScrollAction(type="scroll", direction="down"),
        ExecuteJavascriptAction(type="executeJavascript", script="function getTitle() { return document.title; }; getTitle();")
    ]
    response = await app.scrape_url(
        url=TEST_URL,
        formats=["markdown", "html", "rawHtml", "links", "screenshot", "extract", "changeTracking"],
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
        actions=actions,
        change_tracking_options=change_tracking
    )

    assert response.success
    assert hasattr(response, "markdown")
    assert hasattr(response, "html")
    assert hasattr(response, "rawHtml")
    assert hasattr(response, "links")
    assert hasattr(response, "screenshot")
    assert hasattr(response, "extract")
    assert hasattr(response, "metadata")
    assert hasattr(response, "changeTracking")

@pytest.mark.asyncio
async def test_scrape_url_async_all_params_with_extract_full_page_screenshot():
    location = LocationConfig(country="us", languages=["en"])
    extract_schema = {"type": "object", "properties": {"title": {"type": "string"}}}
    extract = JsonConfig(prompt="Extract the title", schema=extract_schema)
    change_tracking = ChangeTrackingOptions(modes=["git-diff", "json"], prompt="Track changes", schema=extract_schema)
    actions = [
        WaitAction(type="wait", milliseconds=500),
        ScreenshotAction(type="screenshot", fullPage=True),
        WriteAction(type="write", text="test input"),
        PressAction(type="press", key="Enter"),
        ScrollAction(type="scroll", direction="down"),
        ExecuteJavascriptAction(type="executeJavascript", script="function getTitle() { return document.title; }; getTitle();")
    ]
    response = await app.scrape_url(
        url=TEST_URL,
        formats=["markdown", "html", "rawHtml", "links", "screenshot@fullPage", "extract", "changeTracking"],
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
        actions=actions,
        change_tracking_options=change_tracking
    )

    assert response.success
    assert hasattr(response, "markdown")
    assert hasattr(response, "html")
    assert hasattr(response, "rawHtml")
    assert hasattr(response, "links")
    assert hasattr(response, "screenshot")
    assert hasattr(response, "extract")
    assert hasattr(response, "metadata")
    assert hasattr(response, "changeTracking")

@pytest.mark.asyncio
async def test_scrape_url_async_all_params_with_json_options():
    location = LocationConfig(country="us", languages=["en"])
    json_schema = {"type": "object", "properties": {"title": {"type": "string"}}}
    json_options = JsonConfig(prompt="Extract the title as JSON", schema=json_schema)
    change_tracking = ChangeTrackingOptions(modes=["git-diff", "json"], prompt="Track changes", schema=json_schema)
    actions = [
        WaitAction(type="wait", milliseconds=500),
        ScreenshotAction(type="screenshot", fullPage=True),
        WriteAction(type="write", text="test input"),
        PressAction(type="press", key="Enter"),
        ScrollAction(type="scroll", direction="down"),
        ExecuteJavascriptAction(type="executeJavascript", script="function getTitle() { return document.title; }; getTitle();")
    ]
    response = await app.scrape_url(
        url=TEST_URL,
        formats=["markdown", "html", "rawHtml", "links", "screenshot", "json", "changeTracking"],
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
        actions=actions,
        change_tracking_options=change_tracking
    )

    assert response.success
    assert hasattr(response, "markdown")
    assert hasattr(response, "html")
    assert hasattr(response, "rawHtml")
    assert hasattr(response, "links")
    assert hasattr(response, "screenshot")
    assert hasattr(response, "json")
    assert hasattr(response, "metadata")
    assert hasattr(response, "changeTracking") 