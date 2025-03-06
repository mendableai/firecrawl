import importlib.util
import pytest
import time
import os
from uuid import uuid4
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

API_URL = os.getenv('API_URL', 'http://127.0.0.1:3002')
ABSOLUTE_FIRECRAWL_PATH = "firecrawl/firecrawl.py"
TEST_API_KEY = os.getenv('TEST_API_KEY')

print(f"ABSOLUTE_FIRECRAWL_PATH: {ABSOLUTE_FIRECRAWL_PATH}")

spec = importlib.util.spec_from_file_location("FirecrawlApp", ABSOLUTE_FIRECRAWL_PATH)
firecrawl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(firecrawl)
FirecrawlApp = firecrawl.FirecrawlApp

def test_no_api_key():
    if 'api.firecrawl.dev' in API_URL:
        with pytest.raises(Exception) as excinfo:
            invalid_app = FirecrawlApp(api_url=API_URL)
        assert "No API key provided" in str(excinfo.value)
    else:
        # Should not raise error for self-hosted
        app = FirecrawlApp(api_url=API_URL)
        assert app is not None

def test_scrape_url_invalid_api_key():
    if 'api.firecrawl.dev' in API_URL:
        invalid_app = FirecrawlApp(api_url=API_URL, api_key="invalid_api_key")
        with pytest.raises(Exception) as excinfo:
            invalid_app.scrape_url('https://firecrawl.dev')
        assert "Unauthorized: Invalid token" in str(excinfo.value)
    else:
        # Should work without API key for self-hosted
        app = FirecrawlApp(api_url=API_URL)
        response = app.scrape_url('https://firecrawl.dev')
        assert response is not None

# def test_blocklisted_url():
#     blocklisted_url = "https://facebook.com/fake-test"
#     app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
#     with pytest.raises(Exception) as excinfo:
#         app.scrape_url(blocklisted_url)
#     assert "URL is blocked. Firecrawl currently does not support social media scraping due to policy restrictions." in str(excinfo.value)

def test_successful_response_with_valid_preview_token():
    app = FirecrawlApp(api_url=API_URL, api_key=os.getenv('PREVIEW_TOKEN'))
    response = app.scrape_url('https://roastmywebsite.ai')
    assert response is not None
    assert "_Roast_" in response['markdown']
    assert "content" not in response
    assert "html" not in response
    assert "metadata" in response
    assert "links" not in response
    assert "rawHtml" not in response

def test_successful_response_for_valid_scrape():
    app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
    response = app.scrape_url('https://roastmywebsite.ai')
    assert response is not None
    assert 'markdown' in response
    assert "_Roast_" in response['markdown']
    assert 'metadata' in response
    assert 'content' not in response
    assert 'html' not in response
    assert 'rawHtml' not in response
    assert 'screenshot' not in response
    assert 'links' not in response

def test_successful_response_with_valid_api_key_and_options():
    app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
    params = {
        'formats': ['markdown', 'html', 'rawHtml', 'screenshot', 'links'],
        'headers': {'x-key': 'test'},
        'includeTags': ['h1'],
        'excludeTags': ['h2'],
        'onlyMainContent': True,
        'timeout': 30000,
        'waitFor': 1000
    }
    response = app.scrape_url('https://roastmywebsite.ai', params)
    assert response is not None
    assert 'content' not in response
    assert 'markdown' in response
    assert 'html' in response
    assert 'rawHtml' in response
    assert 'screenshot' in response
    assert 'links' in response
    assert "_Roast_" in response['markdown']
    assert "<h1" in response['html']
    assert "<h1" in response['rawHtml']
    assert "https://" in response['screenshot']
    assert len(response['links']) > 0
    assert "https://" in response['links'][0]
    assert 'metadata' in response
    assert 'title' in response['metadata']
    assert 'description' in response['metadata']
    assert 'keywords' in response['metadata']
    assert 'robots' in response['metadata']
    assert 'ogTitle' in response['metadata']
    assert 'ogDescription' in response['metadata']
    assert 'ogUrl' in response['metadata']
    assert 'ogImage' in response['metadata']
    assert 'ogLocaleAlternate' in response['metadata']
    assert 'ogSiteName' in response['metadata']
    assert 'sourceURL' in response['metadata']
    assert 'statusCode' in response['metadata']
    assert 'pageStatusCode' not in response['metadata']
    assert 'pageError' not in response['metadata']
    assert 'error' not in response['metadata']
    assert response['metadata']['title'] == "Roast My Website"
    assert response['metadata']['description'] == "Welcome to Roast My Website, the ultimate tool for putting your website through the wringer! This repository harnesses the power of Firecrawl to scrape and capture screenshots of websites, and then unleashes the latest LLM vision models to mercilessly roast them. 🌶️"
    assert response['metadata']['keywords'] == "Roast My Website,Roast,Website,GitHub,Firecrawl"
    assert response['metadata']['robots'] == "follow, index"
    assert response['metadata']['ogTitle'] == "Roast My Website"
    assert response['metadata']['ogDescription'] == "Welcome to Roast My Website, the ultimate tool for putting your website through the wringer! This repository harnesses the power of Firecrawl to scrape and capture screenshots of websites, and then unleashes the latest LLM vision models to mercilessly roast them. 🌶️"
    assert response['metadata']['ogUrl'] == "https://www.roastmywebsite.ai"
    assert response['metadata']['ogImage'] == "https://www.roastmywebsite.ai/og.png"
    assert response['metadata']['ogLocaleAlternate'] == []
    assert response['metadata']['ogSiteName'] == "Roast My Website"
    assert response['metadata']['sourceURL'] == "https://roastmywebsite.ai"
    assert response['metadata']['statusCode'] == 200

def test_successful_response_for_valid_scrape_with_pdf_file():
    app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
    response = app.scrape_url('https://arxiv.org/pdf/astro-ph/9301001.pdf')
    assert response is not None
    assert 'content' not in response
    assert 'metadata' in response
    assert 'We present spectrophotometric observations of the Broad Line Radio Galaxy' in response['markdown']

def test_successful_response_for_valid_scrape_with_pdf_file_without_explicit_extension():
    app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
    response = app.scrape_url('https://arxiv.org/pdf/astro-ph/9301001')
    time.sleep(1)  # wait for 1 second
    assert response is not None
    assert 'We present spectrophotometric observations of the Broad Line Radio Galaxy' in response['markdown']

def test_crawl_url_invalid_api_key():
    if 'api.firecrawl.dev' in API_URL:
        invalid_app = FirecrawlApp(api_url=API_URL, api_key="invalid_api_key")
        with pytest.raises(Exception) as excinfo:
            invalid_app.crawl_url('https://firecrawl.dev')
        assert "Unauthorized: Invalid token" in str(excinfo.value)
    else:
        # Should work without API key for self-hosted
        app = FirecrawlApp(api_url=API_URL)
        response = app.crawl_url('https://firecrawl.dev')
        assert response is not None

# def test_should_return_error_for_blocklisted_url():
#     app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
#     blocklisted_url = "https://twitter.com/fake-test"
#     with pytest.raises(Exception) as excinfo:
#         app.crawl_url(blocklisted_url)
#     assert "URL is blocked. Firecrawl currently does not support social media scraping due to policy restrictions." in str(excinfo.value)

def test_crawl_url_wait_for_completion_e2e():
    app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
    response = app.crawl_url('https://roastmywebsite.ai', {'excludePaths': ['blog/*']}, True, 30)
    assert response is not None
    assert 'total' in response
    assert response['total'] > 0
    assert 'creditsUsed' in response
    assert response['creditsUsed'] > 0
    assert 'expiresAt' in response
    assert datetime.strptime(response['expiresAt'], '%Y-%m-%dT%H:%M:%S.%fZ') > datetime.now()
    assert 'status' in response
    assert response['status'] == 'completed'
    assert 'next' not in response
    assert len(response['data']) > 0
    assert 'markdown' in response['data'][0]
    assert "_Roast_" in response['data'][0]['markdown']
    assert 'content' not in response['data'][0]
    assert 'html' not in response['data'][0]
    assert 'rawHtml' not in response['data'][0]
    assert 'screenshot' not in response['data'][0]
    assert 'links' not in response['data'][0]
    assert 'metadata' in response['data'][0]
    assert 'title' in response['data'][0]['metadata']
    assert 'description' in response['data'][0]['metadata']
    assert 'language' in response['data'][0]['metadata']
    assert 'sourceURL' in response['data'][0]['metadata']
    assert 'statusCode' in response['data'][0]['metadata']
    assert 'error' not in response['data'][0]['metadata']

def test_crawl_url_with_options_and_wait_for_completion():
    app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
    response = app.crawl_url('https://roastmywebsite.ai', {
        'excludePaths': ['blog/*'],
        'includePaths': ['/'],
        'maxDepth': 2,
        'ignoreSitemap': True,
        'limit': 10,
        'allowBackwardLinks': True,
        'allowExternalLinks': True,
        'scrapeOptions': {
            'formats': ['markdown', 'html', 'rawHtml', 'screenshot', 'links'],
            'headers': {"x-key": "test"},
            'includeTags': ['h1'],
            'excludeTags': ['h2'],
            'onlyMainContent': True,
            'waitFor': 1000
        }
    }, True, 30)
    assert response is not None
    assert 'total' in response
    assert response['total'] > 0
    assert 'creditsUsed' in response
    assert response['creditsUsed'] > 0
    assert 'expiresAt' in response
    assert datetime.strptime(response['expiresAt'], '%Y-%m-%dT%H:%M:%S.%fZ') > datetime.now()
    assert 'status' in response
    assert response['status'] == 'completed'
    assert 'next' not in response
    assert len(response['data']) > 0
    assert 'markdown' in response['data'][0]
    assert "_Roast_" in response['data'][0]['markdown']
    assert 'content' not in response['data'][0]
    assert 'html' in response['data'][0]
    assert "<h1" in response['data'][0]['html']
    assert 'rawHtml' in response['data'][0]
    assert "<h1" in response['data'][0]['rawHtml']
    assert 'screenshot' in response['data'][0]
    assert "https://" in response['data'][0]['screenshot']
    assert 'links' in response['data'][0]
    assert len(response['data'][0]['links']) > 0
    assert 'metadata' in response['data'][0]
    assert 'title' in response['data'][0]['metadata']
    assert 'description' in response['data'][0]['metadata']
    assert 'language' in response['data'][0]['metadata']
    assert 'sourceURL' in response['data'][0]['metadata']
    assert 'statusCode' in response['data'][0]['metadata']
    assert 'error' not in response['data'][0]['metadata']

def test_crawl_url_with_idempotency_key_e2e():
    app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
    uniqueIdempotencyKey = str(uuid4())
    response = app.crawl_url('https://roastmywebsite.ai', {'excludePaths': ['blog/*']}, False, 2, uniqueIdempotencyKey)
    assert response is not None
    assert 'id' in response

    with pytest.raises(Exception) as excinfo:
        app.crawl_url('https://firecrawl.dev', {'excludePaths': ['blog/*']}, True, 2, uniqueIdempotencyKey)
    assert "Idempotency key already used" in str(excinfo.value)

def test_check_crawl_status_e2e():
    app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
    response = app.crawl_url('https://firecrawl.dev', {'scrapeOptions': {'formats': ['markdown', 'html', 'rawHtml', 'screenshot', 'links']}}, False)
    assert response is not None
    assert 'id' in response
    
    max_checks = 15
    checks = 0
    status_response = app.check_crawl_status(response['id'])
    
    while status_response['status'] == 'scraping' and checks < max_checks:
        time.sleep(1)  # wait for 1 second
        assert 'partial_data' not in status_response
        assert 'current' not in status_response
        assert 'data' in status_response
        assert 'total' in status_response
        assert 'creditsUsed' in status_response
        assert 'expiresAt' in status_response
        assert 'status' in status_response
        assert 'next' in status_response
        assert status_response['total'] > 0
        assert status_response['creditsUsed'] > 0
        assert datetime.strptime(status_response['expiresAt'], '%Y-%m-%dT%H:%M:%S.%fZ') > datetime.now()
        assert status_response['status'] == 'scraping'
        assert '/v1/crawl/' in status_response['next']
        status_response = app.check_crawl_status(response['id'])
        checks += 1

    assert status_response is not None
    assert 'total' in status_response
    assert status_response['total'] > 0
    assert 'creditsUsed' in status_response
    assert status_response['creditsUsed'] > 0
    assert 'expiresAt' in status_response
    assert datetime.strptime(status_response['expiresAt'], '%Y-%m-%dT%H:%M:%S.%fZ') > datetime.now()
    assert 'status' in status_response
    assert status_response['status'] == 'completed'
    assert len(status_response['data']) > 0
    assert 'markdown' in status_response['data'][0]
    assert len(status_response['data'][0]['markdown']) > 10
    assert 'content' not in status_response['data'][0]
    assert 'html' in status_response['data'][0]
    assert "<div" in status_response['data'][0]['html']
    assert 'rawHtml' in status_response['data'][0]
    assert "<div" in status_response['data'][0]['rawHtml']
    assert 'screenshot' in status_response['data'][0]
    assert "https://" in status_response['data'][0]['screenshot']
    assert 'links' in status_response['data'][0]
    assert status_response['data'][0]['links'] is not None
    assert len(status_response['data'][0]['links']) > 0
    assert 'metadata' in status_response['data'][0]
    assert 'title' in status_response['data'][0]['metadata']
    assert 'description' in status_response['data'][0]['metadata']
    assert 'language' in status_response['data'][0]['metadata']
    assert 'sourceURL' in status_response['data'][0]['metadata']
    assert 'statusCode' in status_response['data'][0]['metadata']
    assert 'error' not in status_response['data'][0]['metadata']

def test_invalid_api_key_on_map():
    if 'api.firecrawl.dev' in API_URL:
        invalid_app = FirecrawlApp(api_key="invalid_api_key", api_url=API_URL)
        with pytest.raises(Exception) as excinfo:
            invalid_app.map_url('https://roastmywebsite.ai')
        assert "Unauthorized: Invalid token" in str(excinfo.value)
    else:
        # Should work without API key for self-hosted
        app = FirecrawlApp(api_url=API_URL)
        response = app.map_url('https://roastmywebsite.ai')
        assert response is not None

# def test_blocklisted_url_on_map():
#     app = FirecrawlApp(api_key=TEST_API_KEY, api_url=API_URL)
#     blocklisted_url = "https://facebook.com/fake-test"
#     with pytest.raises(Exception) as excinfo:
#         app.map_url(blocklisted_url)
#     assert "URL is blocked. Firecrawl currently does not support social media scraping due to policy restrictions." in str(excinfo.value)

def test_successful_response_with_valid_preview_token_on_map():
    app = FirecrawlApp(api_key=os.getenv('PREVIEW_TOKEN'), api_url=API_URL)
    response = app.map_url('https://roastmywebsite.ai')
    assert response is not None
    assert len(response) > 0

def test_successful_response_for_valid_map():
    app = FirecrawlApp(api_key=TEST_API_KEY, api_url=API_URL)
    response = app.map_url('https://roastmywebsite.ai')
    assert response is not None
    assert len(response) > 0
    assert any("https://" in link for link in response)
    filtered_links = [link for link in response if "roastmywebsite.ai" in link]
    assert len(filtered_links) > 0

def test_search_e2e():
    app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
    with pytest.raises(NotImplementedError) as excinfo:
        app.search("test query")
    assert "Search is not supported in v1" in str(excinfo.value)

# def test_llm_extraction():
#     app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
#     response = app.scrape_url("https://mendable.ai", {
#         'extractorOptions': {
#             'mode': 'llm-extraction',
#             'extractionPrompt': "Based on the information on the page, find what the company's mission is and whether it supports SSO, and whether it is open source",
#             'extractionSchema': {
#                 'type': 'object',
#                 'properties': {
#                     'company_mission': {'type': 'string'},
#                     'supports_sso': {'type': 'boolean'},
#                     'is_open_source': {'type': 'boolean'}
#                 },
#                 'required': ['company_mission', 'supports_sso', 'is_open_source']
#             }
#         }
#     })
#     assert response is not None
#     assert 'llm_extraction' in response
#     llm_extraction = response['llm_extraction']
#     assert 'company_mission' in llm_extraction
#     assert isinstance(llm_extraction['supports_sso'], bool)
#     assert isinstance(llm_extraction['is_open_source'], bool)

def test_search_with_string_query():
    app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
    response = app.search("firecrawl")
    assert response["success"] is True
    assert len(response["data"]) > 0
    assert response["data"][0]["markdown"] is not None
    assert response["data"][0]["metadata"] is not None
    assert response["data"][0]["metadata"]["title"] is not None
    assert response["data"][0]["metadata"]["description"] is not None

def test_search_with_params_dict():
    app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
    response = app.search("firecrawl", {
        "limit": 3,
        "lang": "en",
        "country": "us",
        "scrapeOptions": {
            "formats": ["markdown", "html", "links"],
            "onlyMainContent": True
        }
    })
    assert response["success"] is True
    assert len(response["data"]) <= 3
    for doc in response["data"]:
        assert doc["markdown"] is not None
        assert doc["html"] is not None
        assert doc["links"] is not None
        assert doc["metadata"] is not None
        assert doc["metadata"]["title"] is not None
        assert doc["metadata"]["description"] is not None

def test_search_with_params_object():
    app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
    params = SearchParams(
        query="firecrawl",
        limit=3,
        lang="en",
        country="us",
        scrapeOptions={
            "formats": ["markdown", "html", "links"],
            "onlyMainContent": True
        }
    )
    response = app.search(params.query, params)
    assert response["success"] is True
    assert len(response["data"]) <= 3
    for doc in response["data"]:
        assert doc["markdown"] is not None
        assert doc["html"] is not None
        assert doc["links"] is not None
        assert doc["metadata"] is not None
        assert doc["metadata"]["title"] is not None
        assert doc["metadata"]["description"] is not None

def test_search_invalid_api_key():
    app = FirecrawlApp(api_url=API_URL, api_key="invalid_api_key")
    with pytest.raises(Exception) as e:
        app.search("test query")
    assert "404" in str(e.value)

def test_search_with_invalid_params():
    app = FirecrawlApp(api_url=API_URL, api_key=TEST_API_KEY)
    with pytest.raises(Exception) as e:
        app.search("test query", {"invalid_param": "value"})
    assert "ValidationError" in str(e.value)


