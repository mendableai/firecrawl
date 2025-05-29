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

TEST_URL = 'https://firecrawl-e2e-test-git-main-rafaelsideguides-projects.vercel.app/actions'

@pytest.mark.asyncio
async def test_scrape_url_async_simple():
    response = await app.scrape_url(
        TEST_URL,
        formats=["markdown"]
    )
    
    # Basic response assertions
    assert response.success
    assert hasattr(response, "markdown")
    assert response.markdown is not None
    assert isinstance(response.markdown, str)
    assert len(response.markdown) > 0
    assert "This page is used for end-to-end (e2e) testing with Firecrawl." in response.markdown
    
    # Metadata assertions
    assert hasattr(response, "metadata")
    assert response.metadata is not None

@pytest.mark.asyncio
async def test_scrape_url_async_with_html():
    """Test async scraping with HTML format"""
    response = await app.scrape_url(
        TEST_URL,
        formats=["markdown", "html"]
    )
    
    # Basic response assertions
    assert response.success
    assert hasattr(response, "markdown")
    assert response.markdown is not None
    assert isinstance(response.markdown, str)
    assert len(response.markdown) > 0
    
    # HTML assertions
    assert hasattr(response, "html")
    assert response.html is not None
    assert isinstance(response.html, str)
    assert len(response.html) > 0
    
    # Basic HTML structure check
    html_lower = response.html.lower()
    assert "<html" in html_lower or "<body" in html_lower or "<div" in html_lower
    # Content validation
    assert "firecrawl" in html_lower or "e2e" in html_lower or "testing" in html_lower
    
    # Metadata assertions
    assert hasattr(response, "metadata")
    assert response.metadata is not None

@pytest.mark.asyncio
async def test_scrape_url_async_all_params_with_json_options():
    location = LocationConfig(country="us", languages=["en"])
    json_schema = {"type": "object", "properties": {"title": {"type": "string"}}}
    json_options = JsonConfig(prompt="Extract the title as JSON", schema=json_schema)
    change_tracking = ChangeTrackingOptions(modes=["git-diff", "json"])
    actions = [
        WaitAction(milliseconds=500),
        ScreenshotAction(full_page=True),
        WriteAction(text="test input"),
        PressAction(key="Enter"),
        ScrollAction(direction="down"),
        ExecuteJavascriptAction(script="function get_title() { return document.title; }; get_title();")
    ]
    response = await app.scrape_url(
        url=TEST_URL,
        formats=["markdown", "html", "raw_html", "links", "screenshot", "json", "change_tracking"],
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
        actions=actions,
        change_tracking_options=change_tracking
    )

    # Basic response assertions
    assert response.success
    assert response.error is None
    
    # Format assertions
    assert hasattr(response, "markdown")
    assert response.markdown is not None
    assert isinstance(response.markdown, str)
    assert len(response.markdown) > 0
    
    assert hasattr(response, "html")
    assert response.html is not None
    assert isinstance(response.html, str)
    assert len(response.html) > 0
    
    # HTML content validation
    html_lower = response.html.lower()
    # Check for basic HTML structure
    assert "<html" in html_lower or "<body" in html_lower or "<div" in html_lower
    # Ensure HTML contains some meaningful content (not just empty tags)
    assert len(response.html.strip()) > 100  # Reasonable minimum for actual content
    # Check for common HTML elements that should be present
    assert any(tag in html_lower for tag in ["<p", "<div", "<span", "<h1", "<h2", "<h3"])
    # Verify HTML is properly formed (has closing tags)
    if "<body" in html_lower:
        assert "</body>" in html_lower
    if "<html" in html_lower:
        assert "</html>" in html_lower
    # Content validation - ensure HTML contains expected test content
    assert "firecrawl" in html_lower or "e2e" in html_lower or "testing" in html_lower
    
    assert hasattr(response, "raw_html")
    assert response.raw_html is not None
    assert isinstance(response.raw_html, str)
    assert len(response.raw_html) > 0
    
    # Raw HTML validation
    raw_html_lower = response.raw_html.lower()
    # Raw HTML should be substantial and contain raw HTML characteristics
    assert len(response.raw_html) >= len(response.html) * 0.5  # Raw HTML should be substantial
    # Check for raw HTML characteristics
    assert any(indicator in raw_html_lower for indicator in ["<!doctype", "<html", "<head", "<meta"])
    # Raw HTML should also contain the test content
    assert "firecrawl" in raw_html_lower or "e2e" in raw_html_lower or "testing" in raw_html_lower
    
    assert hasattr(response, "links")
    assert response.links is not None
    assert isinstance(response.links, list)
    
    # Validate links format
    for link in response.links:
        assert isinstance(link, str)
        # Links should be valid URLs or relative paths
        assert link.startswith(("http://", "https://", "/", "#")) or "." in link
    
    assert hasattr(response, "screenshot")
    assert response.screenshot is not None
    assert isinstance(response.screenshot, str)
    assert response.screenshot.startswith(("data:image/", "https://"))
    
    assert hasattr(response, "json")
    assert response.json is not None
    assert isinstance(response.json, dict)
    
    # Metadata assertions
    assert hasattr(response, "metadata")
    assert response.metadata is not None
    assert isinstance(response.metadata, dict)
    
    # Change tracking assertions
    assert hasattr(response, "change_tracking")
    assert response.change_tracking is not None
    assert hasattr(response.change_tracking, "previous_scrape_at")
    assert hasattr(response.change_tracking, "change_status")
    assert hasattr(response.change_tracking, "visibility")
    assert hasattr(response.change_tracking, "diff")
    assert hasattr(response.change_tracking, "json")
    
    # Change status can be either "changed" or "same"
    assert response.change_tracking.change_status in ["changed", "same", "new"]
    assert response.change_tracking.visibility in ["visible", "hidden"]
    
    # If status is "changed", diff and json should have data; if "same", they can be None
    if response.change_tracking.change_status == "changed":
        assert response.change_tracking.diff is not None
        assert response.change_tracking.json is not None
    # For "same" status, diff and json can be None (no changes detected) 

@pytest.mark.asyncio
async def test_scrape_url_async_all_params_with_json_options_full_page_screenshot():
    location = LocationConfig(country="us", languages=["en"])
    json_schema = {"type": "object", "properties": {"title": {"type": "string"}}}
    json_options = JsonConfig(prompt="Extract the title as JSON", schema=json_schema)
    change_tracking = ChangeTrackingOptions(modes=["git-diff", "json"])
    actions = [
        WaitAction(milliseconds=500),
        ScreenshotAction(full_page=True),
        WriteAction(text="test input"),
        PressAction(key="Enter"),
        ScrollAction(direction="down"),
        ExecuteJavascriptAction(script="function get_title() { return document.title; }; get_title();")
    ]
    response = await app.scrape_url(
        url=TEST_URL,
        formats=["markdown", "html", "raw_html", "links", "screenshot@full_page", "json", "change_tracking"],
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
        actions=actions,
        change_tracking_options=change_tracking
    )

    # Basic response assertions
    assert response.success
    assert response.error is None
    
    # Format assertions
    assert hasattr(response, "markdown")
    assert response.markdown is not None
    assert isinstance(response.markdown, str)
    assert len(response.markdown) > 0
    
    assert hasattr(response, "html")
    assert response.html is not None
    assert isinstance(response.html, str)
    assert len(response.html) > 0
    
    # HTML content validation
    html_lower = response.html.lower()
    # Check for basic HTML structure
    assert "<html" in html_lower or "<body" in html_lower or "<div" in html_lower
    # Ensure HTML contains some meaningful content (not just empty tags)
    assert len(response.html.strip()) > 100  # Reasonable minimum for actual content
    # Check for common HTML elements that should be present
    assert any(tag in html_lower for tag in ["<p", "<div", "<span", "<h1", "<h2", "<h3"])
    # Verify HTML is properly formed (has closing tags)
    if "<body" in html_lower:
        assert "</body>" in html_lower
    if "<html" in html_lower:
        assert "</html>" in html_lower
    # Content validation - ensure HTML contains expected test content
    assert "firecrawl" in html_lower or "e2e" in html_lower or "testing" in html_lower
    
    assert hasattr(response, "raw_html")
    assert response.raw_html is not None
    assert isinstance(response.raw_html, str)
    assert len(response.raw_html) > 0
    
    # Raw HTML validation
    raw_html_lower = response.raw_html.lower()
    # Raw HTML should be substantial and contain raw HTML characteristics
    assert len(response.raw_html) >= len(response.html) * 0.5  # Raw HTML should be substantial
    # Check for raw HTML characteristics
    assert any(indicator in raw_html_lower for indicator in ["<!doctype", "<html", "<head", "<meta"])
    # Raw HTML should also contain the test content
    assert "firecrawl" in raw_html_lower or "e2e" in raw_html_lower or "testing" in raw_html_lower
    
    assert hasattr(response, "links")
    assert response.links is not None
    assert isinstance(response.links, list)
    
    # Validate links format
    for link in response.links:
        assert isinstance(link, str)
        # Links should be valid URLs or relative paths
        assert link.startswith(("http://", "https://", "/", "#")) or "." in link
    
    assert hasattr(response, "screenshot")
    assert response.screenshot is not None
    assert isinstance(response.screenshot, str)
    assert response.screenshot.startswith(("data:image/", "https://"))
    
    assert hasattr(response, "json")
    assert response.json is not None
    assert isinstance(response.json, dict)
    
    # Metadata assertions
    assert hasattr(response, "metadata")
    assert response.metadata is not None
    assert isinstance(response.metadata, dict)
    
    # Change tracking assertions
    assert hasattr(response, "change_tracking")
    assert response.change_tracking is not None
    assert hasattr(response.change_tracking, "previous_scrape_at")
    assert hasattr(response.change_tracking, "change_status")
    assert hasattr(response.change_tracking, "visibility")
    assert hasattr(response.change_tracking, "diff")
    assert hasattr(response.change_tracking, "json")
    
    # Change status can be either "changed" or "same"
    assert response.change_tracking.change_status in ["changed", "same", "new"]
    assert response.change_tracking.visibility in ["visible", "hidden"]
    
    # If status is "changed", diff and json should have data; if "same", they can be None
    if response.change_tracking.change_status == "changed":
        assert response.change_tracking.diff is not None
        assert response.change_tracking.json is not None
    # For "same" status, diff and json can be None (no changes detected) 