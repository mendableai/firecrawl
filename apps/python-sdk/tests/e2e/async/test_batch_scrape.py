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

@pytest.mark.asyncio
async def test_batch_scrape_urls_simple():
    response = await app.batch_scrape_urls(
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

@pytest.mark.asyncio
async def test_batch_scrape_urls_all_params_with_json_options():
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
    response = await app.batch_scrape_urls(
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
async def test_batch_scrape_urls_all_params_with_json_options_full_page_screenshot():
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
    response = await app.batch_scrape_urls(
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