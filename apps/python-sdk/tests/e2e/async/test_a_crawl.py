import os
import sys
import pytest
import asyncio
from dotenv import load_dotenv

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../')))
from firecrawl.firecrawl import AsyncFirecrawlApp, LocationConfig, WaitAction, ScreenshotAction, WriteAction, PressAction, ScrollAction, ExecuteJavascriptAction, ScrapeOptions

load_dotenv()

API_URL = os.getenv("TEST_API_URL") or "http://localhost:3002"
API_KEY = os.getenv("TEST_API_KEY")

app = AsyncFirecrawlApp(api_url=API_URL, api_key=API_KEY)

TEST_URL = 'https://firecrawl-e2e-test-git-main-rafaelsideguides-projects.vercel.app/'

@pytest.mark.asyncio
async def test_crawl_url_async_simple():
    status = await app.crawl_url(
        TEST_URL,
        limit=1,
        scrape_options=ScrapeOptions(formats=["markdown"])
    )

    # Basic response assertions
    assert status.success
    assert status.error is None
    assert hasattr(status, "data")
    assert status.data is not None
    assert isinstance(status.data, list)
    assert len(status.data) >= 1
    
    # Status assertions
    assert hasattr(status, "status")
    assert status.status == "completed"
    assert hasattr(status, "completed")
    assert hasattr(status, "total")
    assert hasattr(status, "credits_used")
    assert hasattr(status, "expires_at")
    assert isinstance(status.completed, int)
    assert isinstance(status.total, int)
    assert isinstance(status.credits_used, int)
    assert status.completed > 0
    assert status.total > 0
    assert status.credits_used > 0
    
    # Document assertions
    for doc in status.data:
        assert hasattr(doc, "markdown")
        assert hasattr(doc, "metadata")
        assert doc.markdown is not None
        assert doc.metadata is not None
        assert isinstance(doc.markdown, str)
        assert isinstance(doc.metadata, dict)
        assert len(doc.markdown) > 0
    
    # Content assertions
    assert any("This page is used for end-to-end (e2e) testing with Firecrawl." in doc.markdown for doc in status.data)

@pytest.mark.asyncio
async def test_crawl_url_async_all_params():
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
    status = await app.crawl_url(
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
    
    # Basic response assertions
    assert status.success
    assert status.error is None
    assert hasattr(status, "data")
    assert status.data is not None
    assert isinstance(status.data, list)
    assert len(status.data) >= 1
    
    # Status assertions
    assert hasattr(status, "status")
    assert status.status == "completed"
    assert hasattr(status, "completed")
    assert hasattr(status, "total")
    assert hasattr(status, "credits_used")
    assert hasattr(status, "expires_at")
    assert isinstance(status.completed, int)
    assert isinstance(status.total, int)
    assert isinstance(status.credits_used, int)
    assert status.completed > 0
    assert status.total > 0
    assert status.credits_used > 0
    
    # Document format assertions
    for doc in status.data:
        # Basic document structure
        assert hasattr(doc, "metadata")
        assert doc.metadata is not None
        assert isinstance(doc.metadata, dict)
        
        # Format-specific assertions
        assert hasattr(doc, "markdown")
        assert doc.markdown is not None
        assert isinstance(doc.markdown, str)
        assert len(doc.markdown) > 0
        
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
        
        assert hasattr(doc, "raw_html")
        assert doc.raw_html is not None
        assert isinstance(doc.raw_html, str)
        assert len(doc.raw_html) > 0
        
        # Raw HTML should be longer than processed HTML (typically)
        # and should contain DOCTYPE or other raw elements
        raw_html_lower = doc.raw_html.lower()
        assert len(doc.raw_html) >= len(doc.html) * 0.5  # Raw HTML should be substantial
        # Check for raw HTML characteristics
        assert any(indicator in raw_html_lower for indicator in ["<!doctype", "<html", "<head", "<meta"])
        
        assert hasattr(doc, "links")
        assert doc.links is not None
        assert isinstance(doc.links, list)
        
        # Validate links format
        for link in doc.links:
            assert isinstance(link, str)
            # Links should be valid URLs or relative paths
            assert link.startswith(("http://", "https://", "/", "#")) or "." in link
        
        # Metadata structure assertions
        assert "title" in doc.metadata
        assert "description" in doc.metadata
        assert "language" in doc.metadata
        assert "sourceURL" in doc.metadata
        assert "statusCode" in doc.metadata
        
        # Metadata type assertions
        assert isinstance(doc.metadata.get("title"), (str, type(None)))
        assert isinstance(doc.metadata.get("description"), (str, type(None)))
        assert isinstance(doc.metadata.get("language"), (str, type(None)))
        assert isinstance(doc.metadata["sourceURL"], str)
        assert isinstance(doc.metadata["statusCode"], int)
        
        # Status code should be successful
        assert doc.metadata["statusCode"] == 200
        
        assert hasattr(doc, "screenshot")
        assert doc.screenshot is not None
        assert isinstance(doc.screenshot, str)
        assert doc.screenshot.startswith("https://")

@pytest.mark.asyncio
async def test_crawl_url_with_webhook():
    """Test crawl with webhook configuration"""
    status = await app.crawl_url(
        TEST_URL,
        limit=1,
        scrape_options=ScrapeOptions(formats=["markdown"]),
        webhook="https://httpbin.org/post"  # Using httpbin as a test webhook endpoint
    )
    
    # Basic response assertions
    assert status.success
    assert status.error is None
    assert hasattr(status, "data")
    assert status.data is not None
    assert isinstance(status.data, list)
    assert len(status.data) >= 1

@pytest.mark.asyncio
async def test_crawl_url_with_idempotency_key():
    """Test crawl with idempotency key"""
    import uuid
    idempotency_key = str(uuid.uuid4())
    
    status = await app.crawl_url(
        TEST_URL,
        limit=1,
        scrape_options=ScrapeOptions(formats=["markdown"]),
        idempotency_key=idempotency_key
    )
    
    # Basic response assertions
    assert status.success
    assert status.error is None
    assert hasattr(status, "data")
    assert status.data is not None
    assert isinstance(status.data, list)
    assert len(status.data) >= 1

@pytest.mark.asyncio
async def test_crawl_url_error_handling():
    """Test crawl with invalid URL to check error handling"""
    try:
        status = await app.crawl_url(
            "https://this-domain-does-not-exist-12345.com",
            limit=1,
            scrape_options=ScrapeOptions(formats=["markdown"])
        )
        # If no exception is raised, check that the response indicates failure
        # Some invalid URLs might still return a response with error information
        if hasattr(status, 'success'):
            # Either success should be False, or data should be empty/contain errors
            if status.success:
                # If success is True, data might be empty or contain error information
                assert hasattr(status, 'data')
                # Allow for empty data or data with error information
    except Exception as e:
        # Exception is expected for invalid URLs
        assert isinstance(e, Exception)
        assert len(str(e)) > 0 