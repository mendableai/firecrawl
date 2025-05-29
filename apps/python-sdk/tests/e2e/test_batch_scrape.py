import os
import pytest
from dotenv import load_dotenv
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))
from firecrawl.firecrawl import FirecrawlApp, JsonConfig, LocationConfig, WaitAction, ScreenshotAction, WriteAction, PressAction, ScrollAction, ExecuteJavascriptAction

load_dotenv()

API_URL = os.getenv("TEST_API_URL") or "http://localhost:3000"
API_KEY = os.getenv("TEST_API_KEY")

app = FirecrawlApp(api_url=API_URL, api_key=API_KEY)

TEST_URLS = [
    "https://firecrawl-e2e-test-git-main-rafaelsideguides-projects.vercel.app/actions",
    "https://firecrawl-e2e-test-git-main-rafaelsideguides-projects.vercel.app/numbered-pagination"
]

def test_batch_scrape_urls_simple():
    response = app.batch_scrape_urls(
        TEST_URLS,
        formats=["markdown"]
    )
    
    # Basic response assertions
    assert response.success
    assert hasattr(response, "data")
    assert response.data is not None
    assert isinstance(response.data, list)
    assert len(response.data) == len(TEST_URLS)
    
    # Content assertions for each document
    for doc in response.data:
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
    markdown_contents = [doc.markdown for doc in response.data]
    assert any("This page is used for end-to-end (e2e) testing with Firecrawl." in content for content in markdown_contents)
    assert any("Numbered Pagination" in content for content in markdown_contents)

def test_batch_scrape_urls_with_html():
    """Test batch scraping with HTML format"""
    response = app.batch_scrape_urls(
        TEST_URLS,
        formats=["markdown", "html"]
    )
    
    # Basic response assertions
    assert response.success
    assert hasattr(response, "data")
    assert response.data is not None
    assert isinstance(response.data, list)
    assert len(response.data) == len(TEST_URLS)
    
    # Content assertions for each document
    for doc in response.data:
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
        
        # Basic HTML structure check
        html_lower = doc.html.lower()
        assert "<html" in html_lower or "<body" in html_lower or "<div" in html_lower
        # Content validation
        assert "firecrawl" in html_lower or "e2e" in html_lower or "testing" in html_lower or "pagination" in html_lower
        
        # Metadata assertions
        assert hasattr(doc, "metadata")
        assert doc.metadata is not None
        assert isinstance(doc.metadata, dict)
        assert "url" in doc.metadata
        assert doc.metadata["url"] in TEST_URLS

def test_batch_scrape_urls_all_params_with_json_options():
    location = LocationConfig(country="us", languages=["en"])
    json_schema = {"type": "object", "properties": {"title": {"type": "string"}}}
    json_options = JsonConfig(prompt="Extract the title as JSON", schema=json_schema)
    actions = [
        WaitAction(milliseconds=500),
        ScreenshotAction(full_page=True),
        WriteAction(text="test input"),
        PressAction(key="Enter"),
        ScrollAction(direction="down"),
        ExecuteJavascriptAction(script="function get_title() { return document.title; }; get_title();")
    ]
    response = app.batch_scrape_urls(
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
    
    # Basic response assertions
    assert response.success
    assert hasattr(response, "data")
    assert response.data is not None
    assert isinstance(response.data, list)
    assert len(response.data) == len(TEST_URLS)
    
    # Detailed content assertions for each document
    for doc in response.data:
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
        
        # HTML content validation
        html_lower = doc.html.lower()
        # Check for basic HTML structure
        assert "<html" in html_lower or "<body" in html_lower or "<div" in html_lower
        # Ensure HTML contains some meaningful content (not just empty tags)
        assert len(doc.html.strip()) > 100  # Reasonable minimum for actual content
        # Check for common HTML elements that should be present
        assert any(tag in html_lower for tag in ["<p", "<div", "<span", "<h1", "<h2", "<h3"])
        # Verify HTML is properly formed (has closing tags)
        if "<body" in html_lower:
            assert "</body>" in html_lower
        if "<html" in html_lower:
            assert "</html>" in html_lower
        # Content validation - ensure HTML contains expected test content
        assert "firecrawl" in html_lower or "e2e" in html_lower or "testing" in html_lower or "pagination" in html_lower
        
        # Raw HTML assertions
        assert hasattr(doc, "raw_html")
        assert doc.raw_html is not None
        assert isinstance(doc.raw_html, str)
        assert len(doc.raw_html) > 0
        
        # Raw HTML validation
        raw_html_lower = doc.raw_html.lower()
        # Raw HTML should be substantial and contain raw HTML characteristics
        assert len(doc.raw_html) >= len(doc.html) * 0.5  # Raw HTML should be substantial
        # Check for raw HTML characteristics
        assert any(indicator in raw_html_lower for indicator in ["<!doctype", "<html", "<head", "<meta"])
        # Raw HTML should also contain the test content
        assert "firecrawl" in raw_html_lower or "e2e" in raw_html_lower or "testing" in raw_html_lower or "pagination" in raw_html_lower
        
        # Links assertions
        assert hasattr(doc, "links")
        assert doc.links is not None
        assert isinstance(doc.links, list)
        
        # Validate links format
        for link in doc.links:
            assert isinstance(link, str)
            # Links should be valid URLs or relative paths
            assert link.startswith(("http://", "https://", "/", "#")) or "." in link
        
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

def test_batch_scrape_urls_all_params_with_json_options_full_page_screenshot():
    location = LocationConfig(country="us", languages=["en"])
    json_schema = {"type": "object", "properties": {"title": {"type": "string"}}}
    json_options = JsonConfig(prompt="Extract the title as JSON", schema=json_schema)
    actions = [
        WaitAction(milliseconds=500),
        ScreenshotAction(full_page=True),
        WriteAction(text="test input"),
        PressAction(key="Enter"),
        ScrollAction(direction="down"),
        ExecuteJavascriptAction(script="function get_title() { return document.title; }; get_title();")
    ]
    response = app.batch_scrape_urls(
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
    
    # Basic response assertions
    assert response.success
    assert hasattr(response, "data")
    assert response.data is not None
    assert isinstance(response.data, list)
    assert len(response.data) == len(TEST_URLS)
    
    # Detailed content assertions for each document
    for doc in response.data:
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
        
        # HTML content validation
        html_lower = doc.html.lower()
        # Check for basic HTML structure
        assert "<html" in html_lower or "<body" in html_lower or "<div" in html_lower
        # Ensure HTML contains some meaningful content (not just empty tags)
        assert len(doc.html.strip()) > 100  # Reasonable minimum for actual content
        # Check for common HTML elements that should be present
        assert any(tag in html_lower for tag in ["<p", "<div", "<span", "<h1", "<h2", "<h3"])
        # Verify HTML is properly formed (has closing tags)
        if "<body" in html_lower:
            assert "</body>" in html_lower
        if "<html" in html_lower:
            assert "</html>" in html_lower
        # Content validation - ensure HTML contains expected test content
        assert "firecrawl" in html_lower or "e2e" in html_lower or "testing" in html_lower or "pagination" in html_lower
        
        # Raw HTML assertions
        assert hasattr(doc, "raw_html")
        assert doc.raw_html is not None
        assert isinstance(doc.raw_html, str)
        assert len(doc.raw_html) > 0
        
        # Raw HTML validation
        raw_html_lower = doc.raw_html.lower()
        # Raw HTML should be substantial and contain raw HTML characteristics
        assert len(doc.raw_html) >= len(doc.html) * 0.5  # Raw HTML should be substantial
        # Check for raw HTML characteristics
        assert any(indicator in raw_html_lower for indicator in ["<!doctype", "<html", "<head", "<meta"])
        # Raw HTML should also contain the test content
        assert "firecrawl" in raw_html_lower or "e2e" in raw_html_lower or "testing" in raw_html_lower or "pagination" in raw_html_lower
        
        # Links assertions
        assert hasattr(doc, "links")
        assert doc.links is not None
        assert isinstance(doc.links, list)
        
        # Validate links format
        for link in doc.links:
            assert isinstance(link, str)
            # Links should be valid URLs or relative paths
            assert link.startswith(("http://", "https://", "/", "#")) or "." in link
        
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