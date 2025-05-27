import sys
import os
import subprocess
import time
import pytest
from dotenv import load_dotenv

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))
from firecrawl import FirecrawlApp, JsonConfig, LocationConfig, ChangeTrackingOptions
from firecrawl.firecrawl import WaitAction, ScreenshotAction, WriteAction, PressAction, ScrollAction, ExecuteJavascriptAction

load_dotenv()

API_URL = os.getenv("TEST_API_URL") or "http://localhost:3002"
API_KEY = os.getenv("TEST_API_KEY")
TEST_URL = 'https://firecrawl-e2e-test-git-main-rafaelsideguides-projects.vercel.app/actions'

app = FirecrawlApp(api_url=API_URL, api_key=API_KEY)

def test_scrape_url_simple():
    response = app.scrape_url(
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

def test_scrape_url_all_params_with_json_options():
    location = LocationConfig(country="us", languages=["en"])
    json_schema = {"type": "object", "properties": {"title": {"type": "string"}}}
    json_options = JsonConfig(prompt="Extract the title as JSON", schema=json_schema)
    change_tracking = ChangeTrackingOptions(modes=["git-diff", "json"]) # , prompt="Track changes", schema=json_schema
    actions = [
        WaitAction(milliseconds=500),
        ScreenshotAction(full_page=True),
        WriteAction(text="test input"),
        PressAction(key="Enter"),
        ScrollAction(direction="down"),
        ExecuteJavascriptAction(script="function get_title() { return document.title; }; get_title();")
    ]
    response = app.scrape_url(
        url=TEST_URL,
        formats=["markdown", "html", "raw_html", "links", "screenshot", "json", "change_tracking"],
        include_tags=["p"],
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
    
    assert hasattr(response, "raw_html")
    assert response.raw_html is not None
    assert isinstance(response.raw_html, str)
    assert len(response.raw_html) > 0
    
    assert hasattr(response, "links")
    assert response.links is not None
    assert isinstance(response.links, list)
    
    assert hasattr(response, "screenshot")
    assert response.screenshot is not None
    assert isinstance(response.screenshot, str)
    assert response.screenshot.startswith("https://")
    
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

def test_scrape_url_all_params_with_json_options_full_page_screenshot():
    location = LocationConfig(country="us", languages=["en"])
    json_schema = {"type": "object", "properties": {"title": {"type": "string"}}}
    json_options = JsonConfig(prompt="Extract the title as JSON", schema=json_schema)
    change_tracking = ChangeTrackingOptions(modes=["git-diff", "json"]) # , prompt="Track changes", schema=json_schema
    actions = [
        WaitAction(milliseconds=500),
        ScreenshotAction(full_page=True),
        WriteAction(text="test input"),
        PressAction(key="Enter"),
        ScrollAction(direction="down"),
        ExecuteJavascriptAction(script="function get_title() { return document.title; }; get_title();")
    ]
    response = app.scrape_url(
        url=TEST_URL,
        formats=["markdown", "html", "raw_html", "links", "screenshot@full_page", "json", "change_tracking"],
        include_tags=["p"],
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
    
    assert hasattr(response, "raw_html")
    assert response.raw_html is not None
    assert isinstance(response.raw_html, str)
    assert len(response.raw_html) > 0
    
    assert hasattr(response, "links")
    assert response.links is not None
    assert isinstance(response.links, list)
    
    assert hasattr(response, "screenshot")
    assert response.screenshot is not None
    assert isinstance(response.screenshot, str)
    assert response.screenshot.startswith("https://")
    
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
    
    if response.change_tracking.change_status == "changed":
        assert response.change_tracking.diff is not None
        assert response.change_tracking.json is not None