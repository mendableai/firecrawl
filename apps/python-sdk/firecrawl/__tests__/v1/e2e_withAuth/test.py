import importlib.util
import pytest
import time
import os
from uuid import uuid4
from dotenv import load_dotenv

load_dotenv()

API_URL = "http://127.0.0.1:3002";
ABSOLUTE_FIRECRAWL_PATH = "firecrawl/firecrawl.py"
TEST_API_KEY = os.getenv('TEST_API_KEY')

print(f"ABSOLUTE_FIRECRAWL_PATH: {ABSOLUTE_FIRECRAWL_PATH}")

spec = importlib.util.spec_from_file_location("FirecrawlApp", ABSOLUTE_FIRECRAWL_PATH)
firecrawl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(firecrawl)
FirecrawlApp = firecrawl.FirecrawlApp

def test_no_api_key():
    with pytest.raises(Exception) as excinfo:
      invalid_app = FirecrawlApp(api_url=API_URL)
    assert "No API key provided" in str(excinfo.value)

def test_scrape_url_invalid_api_key():
    invalid_app = FirecrawlApp(api_url=API_URL, api_key="invalid_api_key")
    with pytest.raises(Exception) as excinfo:
        invalid_app.scrape_url('https://firecrawl.dev')
    assert "Unexpected error during scrape URL: Status code 401. Unauthorized: Invalid token" in str(excinfo.value)

def test_blocklisted_url():
    blocklisted_url = "https://facebook.com/fake-test"
    app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
    with pytest.raises(Exception) as excinfo:
        app.scrape_url(blocklisted_url)
    assert "Unexpected error during scrape URL: Status code 403. Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it." in str(excinfo.value)

def test_successful_response_with_valid_preview_token():
    app = FirecrawlApp(api_url=API_URL, api_key="this_is_just_a_preview_token")
    response = app.scrape_url('https://roastmywebsite.ai')
    assert response is not None
    assert 'content' in response
    assert "_Roast_" in response['content']

def test_scrape_url_e2e():
    app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
    response = app.scrape_url('https://roastmywebsite.ai')
    assert response is not None
    assert 'content' not in response
    assert 'markdown' in response
    assert 'metadata' in response
    assert 'html' not in response
    assert "_Roast_" in response['markdown']

def test_successful_response_with_valid_api_key_and_include_html():
    app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
    response = app.scrape_url('https://roastmywebsite.ai', { 'formats': [ 'markdown', 'html' ]})
    assert response is not None
    assert 'content' not in response
    assert 'markdown' in response
    assert 'html' in response
    assert 'metadata' in response
    assert "_Roast_" in response['markdown']
    assert "<h1" in response['html']

def test_successful_response_for_valid_scrape_with_pdf_file():
    app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
    response = app.scrape_url('https://arxiv.org/pdf/astro-ph/9301001.pdf')
    assert response is not None
    assert 'content' not in response
    assert 'metadata' in response
    assert 'We present spectrophotometric observations of the Broad Line Radio Galaxy' in response['content']

def test_successful_response_for_valid_scrape_with_pdf_file_without_explicit_extension():
    app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
    response = app.scrape_url('https://arxiv.org/pdf/astro-ph/9301001')
    time.sleep(6)  # wait for 6 seconds
    assert response is not None
    assert 'content' not in response
    assert 'metadata' in response
    assert 'We present spectrophotometric observations of the Broad Line Radio Galaxy' in response['content']

def test_crawl_url_invalid_api_key():
    invalid_app = FirecrawlApp(api_url=API_URL, api_key="invalid_api_key")
    with pytest.raises(Exception) as excinfo:
        invalid_app.crawl_url('https://firecrawl.dev')
    assert "Unexpected error during start crawl job: Status code 401. Unauthorized: Invalid token" in str(excinfo.value)

def test_should_return_error_for_blocklisted_url():
    app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
    blocklisted_url = "https://twitter.com/fake-test"
    with pytest.raises(Exception) as excinfo:
        app.crawl_url(blocklisted_url)
    assert "Unexpected error during start crawl job: Status code 403. Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it." in str(excinfo.value)

def test_crawl_url_wait_for_completion_e2e():
    app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
    response = app.crawl_url('https://roastmywebsite.ai', {'crawlerOptions': {'excludes': ['blog/*']}}, True)
    assert response is not None
    assert len(response) > 0
    assert 'content' not in response[0]
    assert 'markdown' in response[0]
    assert "_Roast_" in response[0]['markdown']

def test_crawl_url_with_idempotency_key_e2e():
    app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
    uniqueIdempotencyKey = str(uuid4())
    response = app.crawl_url('https://roastmywebsite.ai', {'crawlerOptions': {'excludes': ['blog/*']}}, True, 2, uniqueIdempotencyKey)
    assert response is not None
    assert len(response) > 0
    assert 'content' in response[0]
    assert "_Roast_" in response[0]['content']

    with pytest.raises(Exception) as excinfo:
        app.crawl_url('https://firecrawl.dev', {'crawlerOptions': {'excludes': ['blog/*']}}, True, 2, uniqueIdempotencyKey)
    assert "Conflict: Failed to start crawl job due to a conflict. Idempotency key already used" in str(excinfo.value) 

def test_check_crawl_status_e2e():
    app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
    response = app.crawl_url('https://firecrawl.dev', {'crawlerOptions': {'excludes': ['blog/*']}}, False)
    assert response is not None
    assert 'jobId' in response
    
    time.sleep(30)  # wait for 30 seconds
    status_response = app.check_crawl_status(response['jobId'])
    assert status_response is not None
    assert 'status' in status_response
    assert status_response['status'] == 'completed'
    assert 'data' in status_response
    assert len(status_response['data']) > 0

def test_search_e2e():
    app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
    with pytest.raises(NotImplementedError) as excinfo:
        app.search("test query")
    assert "Search is not supported in v1" in str(excinfo.value)

def test_llm_extraction():
    app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
    response = app.scrape_url("https://mendable.ai", {
        'extractorOptions': {
            'mode': 'llm-extraction',
            'extractionPrompt': "Based on the information on the page, find what the company's mission is and whether it supports SSO, and whether it is open source",
            'extractionSchema': {
                'type': 'object',
                'properties': {
                    'company_mission': {'type': 'string'},
                    'supports_sso': {'type': 'boolean'},
                    'is_open_source': {'type': 'boolean'}
                },
                'required': ['company_mission', 'supports_sso', 'is_open_source']
            }
        }
    })
    assert response is not None
    assert 'llm_extraction' in response
    llm_extraction = response['llm_extraction']
    assert 'company_mission' in llm_extraction
    assert isinstance(llm_extraction['supports_sso'], bool)
    assert isinstance(llm_extraction['is_open_source'], bool)

def test_map_e2e():
    app = FirecrawlApp(api_url=API_URL, api_key="this_is_just_a_preview_token")
    response = app.map_url('https://roastmywebsite.ai')
    assert response is not None
    assert isinstance(response, list)
    