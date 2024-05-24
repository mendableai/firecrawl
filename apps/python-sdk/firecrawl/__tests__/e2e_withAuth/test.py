import pytest
from firecrawl import FirecrawlApp

TEST_API_KEY = "fc-YOUR_API_KEY"
TEST_URL = "https://firecrawl.dev"

def test_scrape_url_e2e():
    app = FirecrawlApp(api_key=TEST_API_KEY)
    response = app.scrape_url(TEST_URL)
    print(response)
    assert response is not None
    assert 'content' in response
    assert "🔥 Firecrawl" in response['content']

def test_scrape_url_invalid_api_key():
    invalid_app = FirecrawlApp(api_key="invalid_api_key")
    with pytest.raises(Exception) as excinfo:
        invalid_app.scrape_url(TEST_URL)
    assert "Failed to scrape URL. Status code: 401" in str(excinfo.value)

def test_crawl_url_e2e():
    app = FirecrawlApp(api_key=TEST_API_KEY)
    response = app.crawl_url(TEST_URL, {'crawlerOptions': {'excludes': ['blog/*']}}, True)
    assert response is not None
    assert len(response) > 0
    assert 'content' in response[0]
    assert "🔥 Firecrawl" in response[0]['content']

def test_crawl_url_invalid_api_key():
    invalid_app = FirecrawlApp(api_key="invalid_api_key")
    with pytest.raises(Exception) as excinfo:
        invalid_app.crawl_url(TEST_URL)
    assert "Unexpected error occurred while trying to start crawl job. Status code: 401" in str(excinfo.value)

def test_search_e2e():
    app = FirecrawlApp(api_key=TEST_API_KEY)
    response = app.search("test query")
    assert response is not None
    assert 'content' in response[0]
    assert len(response) > 2

def test_search_invalid_api_key():
    invalid_app = FirecrawlApp(api_key="invalid_api_key")
    with pytest.raises(Exception) as excinfo:
        invalid_app.search("test query")
    assert "Failed to search. Status code: 401" in str(excinfo.value)

def test_crawl_with_fast_mode():
    app = FirecrawlApp(api_key=TEST_API_KEY)
    response = app.crawl_url(TEST_URL, {'crawlerOptions': {'mode': 'fast'}}, True)
    assert response is not None
    assert len(response) > 0
    assert 'content' in response[0]

def test_crawl_with_html_inclusion():
    app = FirecrawlApp(api_key=TEST_API_KEY)
    response = app.crawl_url(TEST_URL, {'pageOptions': {'includeHtml': True}}, False)
    assert response is not None
    assert 'jobId' in response

def test_crawl_with_pdf_extraction():
    app = FirecrawlApp(api_key=TEST_API_KEY)
    response = app.crawl_url("https://arxiv.org/pdf/astro-ph/9301001", 
                             {'crawlerOptions': {'limit': 10, 'excludes': ['list/*', 'login', 'abs/*', 'static/*', 'about/*', 'archive/*']}}, False)
    assert response is not None
    assert 'jobId' in response

def test_timeout_during_scraping():
    app = FirecrawlApp(api_key=TEST_API_KEY)
    with pytest.raises(Exception) as excinfo:
        app.scrape_url(TEST_URL, {'timeout': 1000})
    assert 'Failed to scrape URL. Status code: 408' in str(excinfo.value)

def test_llm_extraction():
    app = FirecrawlApp(api_key=TEST_API_KEY)
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