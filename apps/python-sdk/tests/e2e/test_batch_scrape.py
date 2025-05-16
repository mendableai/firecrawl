import os
import pytest
from dotenv import load_dotenv
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))
from firecrawl.firecrawl import FirecrawlApp, JsonConfig, LocationConfig, WaitAction, ScreenshotAction, WriteAction, PressAction, ScrollAction, ExecuteJavascriptAction

load_dotenv()

API_URL = "https://api.firecrawl.dev"
API_KEY = os.getenv("TEST_API_KEY")

app = FirecrawlApp(api_url=API_URL, api_key=API_KEY)

TEST_URLS = [
    "https://example.com",
    "https://www.iana.org"
]

def wait_for_batch_completion(app, job_id, timeout=60):
    for _ in range(timeout):
        status = app.check_batch_scrape_status(job_id)
        if status.status == "completed":
            return status
        import time; time.sleep(1)
    raise TimeoutError("Batch scrape did not complete in time")

def test_batch_scrape_urls_simple():
    job = app.async_batch_scrape_urls(
        TEST_URLS,
        formats=["markdown"]
    )
    assert job.id is not None
    status = wait_for_batch_completion(app, job.id)
    assert status.success
    assert hasattr(status, "data")
    assert len(status.data) == len(TEST_URLS)
    assert any("Example Domain" in doc.markdown for doc in status.data)
    assert any("Internet Assigned Numbers Authority" in doc.markdown for doc in status.data)

def test_batch_scrape_urls_all_params_with_extract():
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
    job = app.async_batch_scrape_urls(
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
    assert job.id is not None
    status = wait_for_batch_completion(app, job.id)
    assert status.success
    assert hasattr(status, "data")
    assert len(status.data) == len(TEST_URLS)
    for doc in status.data:
        assert hasattr(doc, "markdown")
        assert hasattr(doc, "html")
        assert hasattr(doc, "raw_html")
        assert hasattr(doc, "links")
        assert hasattr(doc, "screenshot")
        assert hasattr(doc, "extract")
        assert hasattr(doc, "metadata")

def test_batch_scrape_urls_all_params_with_json_options():
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
    job = app.async_batch_scrape_urls(
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
    assert job.id is not None
    status = wait_for_batch_completion(app, job.id)
    assert status.success
    assert hasattr(status, "data")
    assert len(status.data) == len(TEST_URLS)
    for doc in status.data:
        assert hasattr(doc, "markdown")
        assert hasattr(doc, "html")
        assert hasattr(doc, "raw_html")
        assert hasattr(doc, "links")
        assert hasattr(doc, "screenshot")
        assert hasattr(doc, "json")
        assert hasattr(doc, "metadata") 