import os
import pytest
import sys
from dotenv import load_dotenv
import asyncio

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))
from firecrawl.firecrawl import AsyncFirecrawlApp, LocationConfig, WaitAction, ScreenshotAction, WriteAction, PressAction, ScrollAction, ExecuteJavascriptAction, ScrapeOptions

load_dotenv()

API_URL = os.getenv("TEST_API_URL") or "http://localhost:3002"
API_KEY = os.getenv("TEST_API_KEY")

app = AsyncFirecrawlApp(api_url=API_URL, api_key=API_KEY)

TEST_URL = 'https://firecrawl-e2e-test-git-main-rafaelsideguides-projects.vercel.app/'

async def wait_for_crawl_completion(app, job_id, timeout=60):
    for _ in range(timeout):
        status = await app.check_crawl_status(job_id)
        if status.status == "completed":
            return status
        await asyncio.sleep(1)
    raise TimeoutError("Crawl did not complete in time")

@pytest.mark.asyncio
async def test_crawl_url_simple():
    job = await app.async_crawl_url(
        TEST_URL,
        limit=1,
        scrape_options=ScrapeOptions(formats=["markdown"])
    )
    assert job.id is not None
    status = await wait_for_crawl_completion(app, job.id)
    
    # Basic response assertions
    assert status.success
    assert hasattr(status, "data")
    assert status.data is not None
    assert isinstance(status.data, list)
    assert len(status.data) >= 1
    
    # Status response structure assertions
    assert hasattr(status, "status")
    assert status.status == "completed"
    assert hasattr(status, "completed")
    assert isinstance(status.completed, int)
    assert hasattr(status, "total")
    assert isinstance(status.total, int)
    assert hasattr(status, "credits_used")
    assert isinstance(status.credits_used, int)
    assert hasattr(status, "expires_at")
    
    # Content assertions for each document
    for doc in status.data:
        # Markdown assertions
        assert hasattr(doc, "markdown")
        assert doc.markdown is not None
        assert isinstance(doc.markdown, str)
        assert len(doc.markdown) > 0
        
        # URL assertions
        assert hasattr(doc, "url")
        if doc.url is not None:
            assert isinstance(doc.url, str)
            assert doc.url.startswith(("http://", "https://"))
        
        # Metadata assertions
        assert hasattr(doc, "metadata")
        assert doc.metadata is not None
        assert isinstance(doc.metadata, dict)
        assert "url" in doc.metadata
        assert doc.metadata["url"] is not None
    
    # Content validation
    assert any("This page is used for end-to-end (e2e) testing with Firecrawl." in doc.markdown for doc in status.data)

@pytest.mark.asyncio
async def test_crawl_url_all_params():
    location = LocationConfig(country="us", languages=["en"])
    actions = [
        WaitAction(milliseconds=500),
        ScreenshotAction(full_page=True),
        WriteAction(text="test input"),
        PressAction(key="Enter"),
        ScrollAction(direction="down"),
        ExecuteJavascriptAction(script="function get_title() { return document.title; }; get_title();")
    ]
    scrape_options = ScrapeOptions(
        formats=["markdown", "html", "raw_html", "links", "screenshot"],
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
        actions=actions
    )
    job = await app.async_crawl_url(
        TEST_URL,
        include_paths=["/"],
        exclude_paths=["/notarealpage"],
        max_depth=2,
        max_discovery_depth=2,
        limit=2,
        allow_backward_links=True,
        allow_external_links=False,
        ignore_sitemap=True,
        scrape_options=scrape_options,
        deduplicate_similar_urls=True,
        ignore_query_parameters=True,
        regex_on_full_url=True,
        delay=1
    )
    assert job.id is not None
    status = await wait_for_crawl_completion(app, job.id)
    
    # Basic response assertions
    assert status.success
    assert hasattr(status, "data")
    assert status.data is not None
    assert isinstance(status.data, list)
    assert len(status.data) >= 1
    
    # Status response structure assertions
    assert hasattr(status, "status")
    assert status.status == "completed"
    assert hasattr(status, "completed")
    assert isinstance(status.completed, int)
    assert hasattr(status, "total")
    assert isinstance(status.total, int)
    assert hasattr(status, "credits_used")
    assert isinstance(status.credits_used, int)
    assert hasattr(status, "expires_at")
    
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
        
        # Raw HTML assertions - handle cases where raw_html might be None
        assert hasattr(doc, "raw_html")
        if doc.raw_html is not None:
            assert isinstance(doc.raw_html, str)
            assert len(doc.raw_html) > 0
            
            # Raw HTML validation
            raw_html_lower = doc.raw_html.lower()
            # Raw HTML should be substantial and contain raw HTML characteristics
            assert len(doc.raw_html) >= len(doc.html) * 0.5  # Raw HTML should be substantial
            # Check for raw HTML characteristics
            assert any(indicator in raw_html_lower for indicator in ["<!doctype", "<html", "<head", "<meta"])
        
        # Links assertions
        assert hasattr(doc, "links")
        assert doc.links is not None
        assert isinstance(doc.links, list)
        
        # Validate links format - only if links exist
        if len(doc.links) > 0:
            for link in doc.links:
                assert isinstance(link, str)
                # Links should be valid URLs or relative paths
                assert link.startswith(("http://", "https://", "/", "#")) or "." in link
        
        # Screenshot assertions
        assert hasattr(doc, "screenshot")
        assert doc.screenshot is not None
        assert isinstance(doc.screenshot, str)
        assert doc.screenshot.startswith("https://")
        
        # URL assertions
        assert hasattr(doc, "url")
        if doc.url is not None:
            assert isinstance(doc.url, str)
            assert doc.url.startswith(("http://", "https://"))
        
        # Metadata assertions
        assert hasattr(doc, "metadata")
        assert doc.metadata is not None
        assert isinstance(doc.metadata, dict)
        assert "url" in doc.metadata
        assert doc.metadata["url"] is not None

@pytest.mark.asyncio
async def test_crawl_url_with_html():
    """Test async crawling with comprehensive HTML validation."""
    scrape_options = ScrapeOptions(formats=["markdown", "html"])
    job = await app.async_crawl_url(
        TEST_URL,
        limit=1,
        scrape_options=scrape_options
    )
    assert job.id is not None
    status = await wait_for_crawl_completion(app, job.id)
    
    # Basic response assertions
    assert status.success
    assert hasattr(status, "data")
    assert status.data is not None
    assert isinstance(status.data, list)
    assert len(status.data) >= 1
    
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
        
        # Metadata assertions
        assert hasattr(doc, "metadata")
        assert doc.metadata is not None
        assert isinstance(doc.metadata, dict)
        assert "url" in doc.metadata
        assert doc.metadata["url"] is not None 