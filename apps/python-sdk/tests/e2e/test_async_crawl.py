import os
import pytest
import sys
from dotenv import load_dotenv

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))
from firecrawl.firecrawl import FirecrawlApp, LocationConfig, WaitAction, ScreenshotAction, WriteAction, PressAction, ScrollAction, ExecuteJavascriptAction, ScrapeOptions

load_dotenv()

API_URL = "https://api.firecrawl.dev"
API_KEY = os.getenv("TEST_API_KEY")

app = FirecrawlApp(api_url=API_URL, api_key=API_KEY)

TEST_URL = "https://example.com"

def wait_for_crawl_completion(app, job_id, timeout=60):
    for _ in range(timeout):
        status = app.check_crawl_status(job_id)
        if status.status == "completed":
            return status
        import time; time.sleep(1)
    raise TimeoutError("Crawl did not complete in time")

def test_crawl_url_simple():
    job = app.async_crawl_url(
        TEST_URL,
        limit=1,
        scrape_options=ScrapeOptions(formats=["markdown"])
    )
    assert job.id is not None
    status = wait_for_crawl_completion(app, job.id)
    assert status.success
    assert hasattr(status, "data")
    assert len(status.data) >= 1
    assert any("Example Domain" in doc.markdown for doc in status.data)

def test_crawl_url_all_params():
    location = LocationConfig(country="us", languages=["en"])
    actions = [
        WaitAction(type="wait", milliseconds=500),
        ScreenshotAction(type="screenshot", fullPage=True),
        WriteAction(type="write", text="test input"),
        PressAction(type="press", key="Enter"),
        ScrollAction(type="scroll", direction="down"),
        ExecuteJavascriptAction(type="execute_javascript", script="function get_title() { return document.title; }; get_title();")
    ]
    scrape_options = ScrapeOptions(
        formats=["markdown", "html", "raw_html", "links", "screenshot"],
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
        actions=actions
    )
    job = app.async_crawl_url(
        TEST_URL,
        include_paths=["/"],
        exclude_paths=["/notarealpage"],
        max_depth=2,
        max_discovery_depth=2,
        limit=2,
        allow_backward_links=True,
        allow_external_links=True,
        ignore_sitemap=True,
        scrape_options=scrape_options,
        deduplicate_similar_urls=True,
        ignore_query_parameters=True,
        regex_on_full_url=True,
        delay=1
    )
    assert job.id is not None
    status = wait_for_crawl_completion(app, job.id)
    assert status.success
    assert hasattr(status, "data")
    assert len(status.data) >= 1
    for doc in status.data:
        assert hasattr(doc, "markdown")
        assert hasattr(doc, "html")
        assert hasattr(doc, "raw_html")
        assert hasattr(doc, "links")
        assert hasattr(doc, "screenshot")
        assert hasattr(doc, "metadata") 