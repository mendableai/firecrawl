"""
FirecrawlApp Module

This module provides a class `FirecrawlApp` for interacting with the Firecrawl API.
It includes methods to scrape URLs, perform searches, initiate and monitor crawl jobs,
and check the status of these jobs. The module uses requests for HTTP communication
and handles retries for certain HTTP status codes.

Classes:
    - FirecrawlApp: Main class for interacting with the Firecrawl API.
"""
import logging
import os
import time
from typing import Any, Dict, Optional, List, Union, Callable, Literal, TypeVar, Generic
import json
from datetime import datetime

import requests
import pydantic
import websockets
import aiohttp
import asyncio

logger : logging.Logger = logging.getLogger("firecrawl")

T = TypeVar('T')

class FirecrawlDocumentMetadata(pydantic.BaseModel):
    """Metadata for a Firecrawl document."""
    title: Optional[str] = None
    description: Optional[str] = None
    language: Optional[str] = None
    keywords: Optional[str] = None
    robots: Optional[str] = None
    ogTitle: Optional[str] = None
    ogDescription: Optional[str] = None
    ogUrl: Optional[str] = None
    ogImage: Optional[str] = None
    ogAudio: Optional[str] = None
    ogDeterminer: Optional[str] = None
    ogLocale: Optional[str] = None
    ogLocaleAlternate: Optional[List[str]] = None
    ogSiteName: Optional[str] = None
    ogVideo: Optional[str] = None
    dctermsCreated: Optional[str] = None
    dcDateCreated: Optional[str] = None
    dcDate: Optional[str] = None
    dctermsType: Optional[str] = None
    dcType: Optional[str] = None
    dctermsAudience: Optional[str] = None
    dctermsSubject: Optional[str] = None
    dcSubject: Optional[str] = None
    dcDescription: Optional[str] = None
    dctermsKeywords: Optional[str] = None
    modifiedTime: Optional[str] = None
    publishedTime: Optional[str] = None
    articleTag: Optional[str] = None
    articleSection: Optional[str] = None
    sourceURL: Optional[str] = None
    statusCode: Optional[int] = None
    error: Optional[str] = None

class ActionsResult(pydantic.BaseModel):
    """Result of actions performed during scraping."""
    screenshots: List[str]

class FirecrawlDocument(pydantic.BaseModel, Generic[T]):
    """Document retrieved or processed by Firecrawl."""
    url: Optional[str] = None
    markdown: Optional[str] = None
    html: Optional[str] = None
    rawHtml: Optional[str] = None
    links: Optional[List[str]] = None
    extract: Optional[T] = None
    json: Optional[T] = None
    screenshot: Optional[str] = None
    metadata: Optional[FirecrawlDocumentMetadata] = None
    actions: Optional[ActionsResult] = None
    title: Optional[str] = None  # v1 search only
    description: Optional[str] = None  # v1 search only

class LocationConfig(pydantic.BaseModel):
    """Location configuration for scraping."""
    country: Optional[str] = None
    languages: Optional[List[str]] = None

class WebhookConfig(pydantic.BaseModel):
    """Configuration for webhooks."""
    url: str
    headers: Optional[Dict[str, str]] = None
    metadata: Optional[Dict[str, str]] = None
    events: Optional[List[Literal["completed", "failed", "page", "started"]]] = None

class CrawlScrapeOptions(pydantic.BaseModel):
    """Parameters for scraping operations."""
    formats: Optional[List[Literal["markdown", "html", "rawHtml", "content", "links", "screenshot", "screenshot@fullPage", "extract", "json"]]] = None
    headers: Optional[Dict[str, str]] = None
    includeTags: Optional[List[str]] = None
    excludeTags: Optional[List[str]] = None
    onlyMainContent: Optional[bool] = None
    waitFor: Optional[int] = None
    timeout: Optional[int] = None
    location: Optional[LocationConfig] = None
    mobile: Optional[bool] = None
    skipTlsVerification: Optional[bool] = None
    removeBase64Images: Optional[bool] = None
    blockAds: Optional[bool] = None
    proxy: Optional[Literal["basic", "stealth"]] = None

class WaitAction(pydantic.BaseModel):
    """Wait action to perform during scraping."""
    type: Literal["wait"]
    milliseconds: int
    selector: Optional[str] = None

class ScreenshotAction(pydantic.BaseModel):
    """Screenshot action to perform during scraping."""
    type: Literal["screenshot"]
    fullPage: Optional[bool] = None

class ClickAction(pydantic.BaseModel):
    """Click action to perform during scraping."""
    type: Literal["click"]
    selector: str

class WriteAction(pydantic.BaseModel):
    """Write action to perform during scraping."""
    type: Literal["write"]
    text: str

class PressAction(pydantic.BaseModel):
    """Press action to perform during scraping."""
    type: Literal["press"]
    key: str

class ScrollAction(pydantic.BaseModel):
    """Scroll action to perform during scraping."""
    type: Literal["scroll"]
    direction: Literal["up", "down"]
    selector: Optional[str] = None

class ScrapeAction(pydantic.BaseModel):
    """Scrape action to perform during scraping."""
    type: Literal["scrape"]

class ExecuteJavascriptAction(pydantic.BaseModel):
    """Execute javascript action to perform during scraping."""
    type: Literal["executeJavascript"]
    script: str

class ExtractConfig(pydantic.BaseModel):
    """Configuration for extraction."""
    prompt: Optional[str] = None
    schema: Optional[Any] = None
    systemPrompt: Optional[str] = None

class ScrapeParams(CrawlScrapeOptions):
    """Parameters for scraping operations."""
    extract: Optional[ExtractConfig] = None
    jsonOptions: Optional[ExtractConfig] = None
    actions: Optional[List[Union[WaitAction, ScreenshotAction, ClickAction, WriteAction, PressAction, ScrollAction, ScrapeAction, ExecuteJavascriptAction]]] = None

class ScrapeResponse(FirecrawlDocument[T], Generic[T]):
    """Response from scraping operations."""
    success: bool = True
    warning: Optional[str] = None
    error: Optional[str] = None

class BatchScrapeResponse(pydantic.BaseModel):
    """Response from batch scrape operations."""
    id: Optional[str] = None
    url: Optional[str] = None
    success: bool = True
    error: Optional[str] = None
    invalidURLs: Optional[List[str]] = None

class BatchScrapeStatusResponse(pydantic.BaseModel):
    """Response from batch scrape status checks."""
    success: bool = True
    status: Literal["scraping", "completed", "failed", "cancelled"]
    completed: int
    total: int
    creditsUsed: int
    expiresAt: datetime
    next: Optional[str] = None
    data: List[FirecrawlDocument]

class CrawlParams(pydantic.BaseModel):
    """Parameters for crawling operations."""
    includePaths: Optional[List[str]] = None
    excludePaths: Optional[List[str]] = None
    maxDepth: Optional[int] = None
    maxDiscoveryDepth: Optional[int] = None
    limit: Optional[int] = None
    allowBackwardLinks: Optional[bool] = None
    allowExternalLinks: Optional[bool] = None
    ignoreSitemap: Optional[bool] = None
    scrapeOptions: Optional[CrawlScrapeOptions] = None
    webhook: Optional[Union[str, WebhookConfig]] = None
    deduplicateSimilarURLs: Optional[bool] = None
    ignoreQueryParameters: Optional[bool] = None
    regexOnFullURL: Optional[bool] = None

class CrawlResponse(pydantic.BaseModel):
    """Response from crawling operations."""
    id: Optional[str] = None
    url: Optional[str] = None
    success: bool = True
    error: Optional[str] = None

class CrawlStatusResponse(pydantic.BaseModel):
    """Response from crawl status checks."""
    success: bool = True
    status: Literal["scraping", "completed", "failed", "cancelled"]
    completed: int
    total: int
    creditsUsed: int
    expiresAt: datetime
    next: Optional[str] = None
    data: List[FirecrawlDocument]

class CrawlErrorsResponse(pydantic.BaseModel):
    """Response from crawl/batch scrape error monitoring."""
    errors: List[Dict[str, str]]  # {id: str, timestamp: str, url: str, error: str}
    robotsBlocked: List[str]

class MapParams(pydantic.BaseModel):
    """Parameters for mapping operations."""
    search: Optional[str] = None
    ignoreSitemap: Optional[bool] = None
    includeSubdomains: Optional[bool] = None
    sitemapOnly: Optional[bool] = None
    limit: Optional[int] = None
    timeout: Optional[int] = None

class MapResponse(pydantic.BaseModel):
    """Response from mapping operations."""
    success: bool = True
    links: Optional[List[str]] = None
    error: Optional[str] = None

class ExtractParams(pydantic.BaseModel):
    """Parameters for extracting information from URLs."""
    prompt: Optional[str] = None
    schema: Optional[Any] = None
    systemPrompt: Optional[str] = None
    allowExternalLinks: Optional[bool] = None
    enableWebSearch: Optional[bool] = None
    includeSubdomains: Optional[bool] = None
    origin: Optional[str] = None
    showSources: Optional[bool] = None
    scrapeOptions: Optional[CrawlScrapeOptions] = None

class ExtractResponse(pydantic.BaseModel, Generic[T]):
    """Response from extract operations."""
    success: bool = True
    data: Optional[T] = None
    error: Optional[str] = None
    warning: Optional[str] = None
    sources: Optional[List[str]] = None

class SearchParams(pydantic.BaseModel):
    query: str
    limit: Optional[int] = 5
    tbs: Optional[str] = None
    filter: Optional[str] = None
    lang: Optional[str] = "en"
    country: Optional[str] = "us"
    location: Optional[str] = None
    origin: Optional[str] = "api"
    timeout: Optional[int] = 60000
    scrapeOptions: Optional[CrawlScrapeOptions] = None

class SearchResponse(pydantic.BaseModel):
    """Response from search operations."""
    success: bool = True
    data: List[FirecrawlDocument]
    warning: Optional[str] = None
    error: Optional[str] = None

class GenerateLLMsTextParams(pydantic.BaseModel):
    """
    Parameters for the LLMs.txt generation operation.
    """
    maxUrls: Optional[int] = 10
    showFullText: Optional[bool] = False
    __experimental_stream: Optional[bool] = None

class DeepResearchParams(pydantic.BaseModel):
    """
    Parameters for the deep research operation.
    """
    maxDepth: Optional[int] = 7
    timeLimit: Optional[int] = 270
    maxUrls: Optional[int] = 20
    __experimental_streamSteps: Optional[bool] = None

class DeepResearchResponse(pydantic.BaseModel):
    """
    Response from the deep research operation.
    """
    success: bool
    id: str
    error: Optional[str] = None

class DeepResearchStatusResponse(pydantic.BaseModel):
    """
    Status response from the deep research operation.
    """
    success: bool
    data: Optional[Dict[str, Any]] = None
    status: str
    error: Optional[str] = None
    expiresAt: str
    currentDepth: int
    maxDepth: int
    activities: List[Dict[str, Any]]
    sources: List[Dict[str, Any]]
    summaries: List[str]

class GenerateLLMsTextResponse(pydantic.BaseModel):
    """Response from LLMs.txt generation operations."""
    success: bool = True
    id: str
    error: Optional[str] = None

class GenerateLLMsTextStatusResponseData(pydantic.BaseModel):
    llmstxt: str
    llmsfulltxt: Optional[str] = None

class GenerateLLMsTextStatusResponse(pydantic.BaseModel):
    """Status response from LLMs.txt generation operations."""
    success: bool = True
    data: Optional[GenerateLLMsTextStatusResponseData] = None
    status: Literal["processing", "completed", "failed"]
    error: Optional[str] = None
    expiresAt: str

class FirecrawlApp:
    def __init__(self, api_key: Optional[str] = None, api_url: Optional[str] = None) -> None:
        """
        Initialize the FirecrawlApp instance with API key, API URL.

        Args:
            api_key (Optional[str]): API key for authenticating with the Firecrawl API.
            api_url (Optional[str]): Base URL for the Firecrawl API.
        """
        self.api_key = api_key or os.getenv('FIRECRAWL_API_KEY')
        self.api_url = api_url or os.getenv('FIRECRAWL_API_URL', 'https://api.firecrawl.dev')
        
        # Only require API key when using cloud service
        if 'api.firecrawl.dev' in self.api_url and self.api_key is None:
            logger.warning("No API key provided for cloud service")
            raise ValueError('No API key provided')
            
        logger.debug(f"Initialized FirecrawlApp with API URL: {self.api_url}")

    def scrape_url(
            self,
            url: str,
            params: Optional[ScrapeParams] = None) -> ScrapeResponse[Any]:
        """
        Scrape and extract content from a URL.

        Args:
          url (str): Target URL to scrape
          params (Optional[ScrapeParams]): See ScrapeParams model for configuration:
            Content Options:
            * formats - Content types to retrieve (markdown/html/etc)
            * includeTags - HTML tags to include
            * excludeTags - HTML tags to exclude
            * onlyMainContent - Extract main content only
                
            Request Options:
            * headers - Custom HTTP headers
            * timeout - Request timeout (ms)
            * mobile - Use mobile user agent
            * proxy - Proxy type (basic/stealth)
                
            Extraction Options:
            * extract - Content extraction settings
            * jsonOptions - JSON extraction settings
            * actions - Actions to perform

        Returns:
          ScrapeResponse with:
          * Requested content formats
          * Page metadata
          * Extraction results
          * Success/error status

        Raises:
          Exception: If scraping fails
        """

        headers = self._prepare_headers()

        # Prepare the base scrape parameters with the URL
        scrape_params = {'url': url}

        # If there are additional params, process them
        if params:
            # Handle extract (for v1)
            extract = params.get('extract', {})
            if extract:
                if 'schema' in extract and hasattr(extract['schema'], 'schema'):
                    extract['schema'] = extract['schema'].schema()
                scrape_params['extract'] = extract

            # Include any other params directly at the top level of scrape_params
            for key, value in params.items():
                if key not in ['extract']:
                    scrape_params[key] = value

            json = params.get("jsonOptions", {})
            if json:
                if 'schema' in json and hasattr(json['schema'], 'schema'):
                    json['schema'] = json['schema'].schema()
                scrape_params['jsonOptions'] = json

            # Include any other params directly at the top level of scrape_params
            for key, value in params.items():
                if key not in ['jsonOptions']:
                    scrape_params[key] = value


        endpoint = f'/v1/scrape'
        # Make the POST request with the prepared headers and JSON data
        response = requests.post(
            f'{self.api_url}{endpoint}',
            headers=headers,
            json=scrape_params,
            timeout=(scrape_params["timeout"] + 5000 if "timeout" in scrape_params else None),
        )
        if response.status_code == 200:
            try:
                response = response.json()
            except:
                raise Exception(f'Failed to parse Firecrawl response as JSON.')
            if response['success'] and 'data' in response:
                return response['data']
            elif "error" in response:
                raise Exception(f'Failed to scrape URL. Error: {response["error"]}')
            else:
                raise Exception(f'Failed to scrape URL. Error: {response}')
        else:
            self._handle_error(response, 'scrape URL')

    def search(
            self,
            query: str,
            params: Optional[Union[Dict[str, Any], SearchParams]] = None) -> SearchResponse:
        """
        Search for content using Firecrawl.

        Args:
          query (str): Search query string

          params (Optional[Union[Dict[str, Any], SearchParams]]): See SearchParams model:

            Search Options:
            * limit - Max results (default: 5)
            * tbs - Time filter (e.g. "qdr:d")
            * filter - Custom result filter
                
            Localization:
            * lang - Language code (default: "en")
            * country - Country code (default: "us")
            * location - Geo-targeting
            
            Request Options:
            * timeout - Request timeout (ms)
            * scrapeOptions - Result scraping config, check ScrapeParams model for more details

        Returns:
          SearchResponse


        Raises:
          Exception: If search fails
        """
        if params is None:
            params = {}

        if isinstance(params, dict):
            search_params = SearchParams(query=query, **params)
        else:
            search_params = params
            search_params.query = query

        response = requests.post(
            f"{self.api_url}/v1/search",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json=search_params.dict(exclude_none=True)
        )

        if response.status_code != 200:
            raise Exception(f"Request failed with status code {response.status_code}")

        try:
            return response.json()
        except:
            raise Exception(f'Failed to parse Firecrawl response as JSON.')

    def crawl_url(self, url: str,
                  params: Optional[CrawlParams] = None,
                  poll_interval: Optional[int] = 2,
                  idempotency_key: Optional[str] = None) -> CrawlStatusResponse:
        """
        Crawl a website starting from a URL.

        Args:
          url (str): Target URL to start crawling from
          params (Optional[CrawlParams]): See CrawlParams model:
            URL Discovery:
            * includePaths - Patterns of URLs to include
            * excludePaths - Patterns of URLs to exclude
            * maxDepth - Maximum crawl depth
            * maxDiscoveryDepth - Maximum depth for finding new URLs
            * limit - Maximum pages to crawl

            Link Following:
            * allowBackwardLinks - Follow parent directory links
            * allowExternalLinks - Follow external domain links  
            * ignoreSitemap - Skip sitemap.xml processing

            Advanced:
            * scrapeOptions - Page scraping configuration
            * webhook - Notification webhook settings
            * deduplicateSimilarURLs - Remove similar URLs
            * ignoreQueryParameters - Ignore URL parameters
            * regexOnFullURL - Apply regex to full URLs
          poll_interval (int): Seconds between status checks (default: 2)
          idempotency_key (Optional[str]): Unique key to prevent duplicate requests

        Returns:
          CrawlStatusResponse with:
          * Crawling status and progress
          * Crawled page contents
          * Success/error information

        Raises:
          Exception: If crawl fails
        """
        endpoint = f'/v1/crawl'
        headers = self._prepare_headers(idempotency_key)
        json_data = {'url': url}
        if params:
            json_data.update(params)
        response = self._post_request(f'{self.api_url}{endpoint}', json_data, headers)
        if response.status_code == 200:
            try:
                id = response.json().get('id')
            except:
                raise Exception(f'Failed to parse Firecrawl response as JSON.')
            return self._monitor_job_status(id, headers, poll_interval)

        else:
            self._handle_error(response, 'start crawl job')


    def async_crawl_url(
            self,
            url: str,
            params: Optional[CrawlParams] = None,
            idempotency_key: Optional[str] = None) -> CrawlResponse:
        """
        Start an asynchronous crawl job.

        Args:
            url (str): Target URL to start crawling from

            params (Optional[CrawlParams]): See CrawlParams model:

              URL Discovery:
              * includePaths - Patterns of URLs to include
              * excludePaths - Patterns of URLs to exclude
              * maxDepth - Maximum crawl depth
              * maxDiscoveryDepth - Maximum depth for finding new URLs
              * limit - Maximum pages to crawl

              Link Following:
              * allowBackwardLinks - Follow parent directory links
              * allowExternalLinks - Follow external domain links  
              * ignoreSitemap - Skip sitemap.xml processing

              Advanced:
              * scrapeOptions - Page scraping configuration
              * webhook - Notification webhook settings
              * deduplicateSimilarURLs - Remove similar URLs
              * ignoreQueryParameters - Ignore URL parameters
              * regexOnFullURL - Apply regex to full URLs

            idempotency_key: Unique key to prevent duplicate requests

        Returns:
            CrawlResponse with:
            * success - Whether crawl started successfully
            * id - Unique identifier for the crawl job
            * url - Status check URL for the crawl
            * error - Error message if start failed

        Raises:
            Exception: If crawl initiation fails
        """
        endpoint = f'/v1/crawl'
        headers = self._prepare_headers(idempotency_key)
        json_data = {'url': url}
        if params:
            json_data.update(params)
        response = self._post_request(f'{self.api_url}{endpoint}', json_data, headers)
        if response.status_code == 200:
            try:
                return response.json()
            except:
                raise Exception(f'Failed to parse Firecrawl response as JSON.')
        else:
            self._handle_error(response, 'start crawl job')

    def check_crawl_status(self, id: str) -> CrawlStatusResponse:
        """
        Check the status and results of a crawl job.

        Args:
            id: Unique identifier for the crawl job

        Returns:
            CrawlStatusResponse containing:

            Status Information:
            * status - Current state (scraping/completed/failed/cancelled)
            * completed - Number of pages crawled
            * total - Total pages to crawl
            * creditsUsed - API credits consumed
            * expiresAt - Data expiration timestamp
            
            Results:
            * data - List of crawled documents
            * next - URL for next page of results (if paginated)
            * success - Whether status check succeeded
            * error - Error message if failed

        Raises:
            Exception: If status check fails
        """
        endpoint = f'/v1/crawl/{id}'

        headers = self._prepare_headers()
        response = self._get_request(f'{self.api_url}{endpoint}', headers)
        if response.status_code == 200:
            try:
                status_data = response.json()
            except:
                raise Exception(f'Failed to parse Firecrawl response as JSON.')
            if status_data['status'] == 'completed':
                if 'data' in status_data:
                    data = status_data['data']
                    while 'next' in status_data:
                        if len(status_data['data']) == 0:
                            break
                        next_url = status_data.get('next')
                        if not next_url:
                            logger.warning("Expected 'next' URL is missing.")
                            break
                        try:
                            status_response = self._get_request(next_url, headers)
                            if status_response.status_code != 200:
                                logger.error(f"Failed to fetch next page: {status_response.status_code}")
                                break
                            try:
                                next_data = status_response.json()
                            except:
                                raise Exception(f'Failed to parse Firecrawl response as JSON.')
                            data.extend(next_data.get('data', []))
                            status_data = next_data
                        except Exception as e:
                            logger.error(f"Error during pagination request: {e}")
                            break
                    status_data['data'] = data

            response = {
                'status': status_data.get('status'),
                'total': status_data.get('total'),
                'completed': status_data.get('completed'),
                'creditsUsed': status_data.get('creditsUsed'),
                'expiresAt': status_data.get('expiresAt'),
                'data': status_data.get('data')
            }

            if 'error' in status_data:
                response['error'] = status_data['error']

            if 'next' in status_data:
                response['next'] = status_data['next']

            return {
                'success': False if 'error' in status_data else True,
                **response
            }
        else:
            self._handle_error(response, 'check crawl status')
    
    def check_crawl_errors(self, id: str) -> CrawlErrorsResponse:
        """
        Returns information about crawl errors.

        Args:
            id (str): The ID of the crawl job

        Returns:
            CrawlErrorsResponse containing:
            * errors (List[Dict[str, str]]): List of errors with fields:
                - id (str): Error ID
                - timestamp (str): When the error occurred
                - url (str): URL that caused the error
                - error (str): Error message
            * robotsBlocked (List[str]): List of URLs blocked by robots.txt

        Raises:
            Exception: If error check fails
        """
        headers = self._prepare_headers()
        response = self._get_request(f'{self.api_url}/v1/crawl/{id}/errors', headers)
        if response.status_code == 200:
            try:
                return response.json()
            except:
                raise Exception(f'Failed to parse Firecrawl response as JSON.')
        else:
            self._handle_error(response, "check crawl errors")
    
    def cancel_crawl(self, id: str) -> Dict[str, Any]:
        """
        Cancel an asynchronous crawl job.

        Args:
            id (str): The ID of the crawl job to cancel

        Returns:
            Dict[str, Any] containing:
            * success (bool): Whether cancellation was successful
            * error (str, optional): Error message if cancellation failed

        Raises:
            Exception: If cancellation fails
        """
        headers = self._prepare_headers()
        response = self._delete_request(f'{self.api_url}/v1/crawl/{id}', headers)
        if response.status_code == 200:
            try:
                return response.json()
            except:
                raise Exception(f'Failed to parse Firecrawl response as JSON.')
        else:
            self._handle_error(response, "cancel crawl job")

    def crawl_url_and_watch(
            self,
            url: str,
            params: Optional[CrawlParams] = None,
            idempotency_key: Optional[str] = None) -> 'CrawlWatcher':
        """
        Initiate a crawl job and return a CrawlWatcher to monitor the job via WebSocket.

        Args:
          url (str): Target URL to start crawling from
          params (Optional[CrawlParams]): See CrawlParams model for configuration:
            URL Discovery:
            * includePaths - Patterns of URLs to include
            * excludePaths - Patterns of URLs to exclude
            * maxDepth - Maximum crawl depth
            * maxDiscoveryDepth - Maximum depth for finding new URLs
            * limit - Maximum pages to crawl

            Link Following:
            * allowBackwardLinks - Follow parent directory links
            * allowExternalLinks - Follow external domain links  
            * ignoreSitemap - Skip sitemap.xml processing

            Advanced:
            * scrapeOptions - Page scraping configuration
            * webhook - Notification webhook settings
            * deduplicateSimilarURLs - Remove similar URLs
            * ignoreQueryParameters - Ignore URL parameters
            * regexOnFullURL - Apply regex to full URLs
          idempotency_key (Optional[str]): Unique key to prevent duplicate requests

        Returns:
          AsyncCrawlWatcher: An instance to monitor the crawl job via WebSocket

        Raises:
          Exception: If crawl job fails to start
        """
        crawl_response = self.async_crawl_url(url, params, idempotency_key)
        if crawl_response['success'] and 'id' in crawl_response:
            return CrawlWatcher(crawl_response['id'], self)
        else:
            raise Exception("Crawl job failed to start")

    def map_url(
            self,
            url: str,
            params: Optional[MapParams] = None) -> MapResponse:
        """
        Map and discover links from a URL.

        Args:
          url: Target URL to map

          params: See MapParams model:

            Discovery Options:
            * search - Filter pattern for URLs
            * ignoreSitemap - Skip sitemap.xml
            * includeSubdomains - Include subdomain links
            * sitemapOnly - Only use sitemap.xml
            
            Limits:
            * limit - Max URLs to return
            * timeout - Request timeout (ms)

        Returns:
          MapResponse with:
          * Discovered URLs
          * Success/error status

        Raises:
          Exception: If mapping fails
        """
        endpoint = f'/v1/map'
        headers = self._prepare_headers()

        # Prepare the base scrape parameters with the URL
        json_data = {'url': url}
        if params:
            json_data.update(params)

        # Make the POST request with the prepared headers and JSON data
        response = requests.post(
            f'{self.api_url}{endpoint}',
            headers=headers,
            json=json_data,
        )
        if response.status_code == 200:
            try:
                response = response.json()
            except:
                raise Exception(f'Failed to parse Firecrawl response as JSON.')
            if response['success'] and 'links' in response:
                return response
            elif 'error' in response:
                raise Exception(f'Failed to map URL. Error: {response["error"]}')
            else:
                raise Exception(f'Failed to map URL. Error: {response}')
        else:
            self._handle_error(response, 'map')

    def batch_scrape_urls(self, urls: List[str],
                  params: Optional[ScrapeParams] = None,
                  poll_interval: Optional[int] = 2,
                  idempotency_key: Optional[str] = None) -> BatchScrapeStatusResponse:
        """
        Batch scrape multiple URLs and monitor until completion.

        Args:
            urls (List[str]): URLs to scrape
            params (Optional[ScrapeParams]): See ScrapeParams model:
              Content Options:
              * formats - Content formats to retrieve
              * includeTags - HTML tags to include
              * excludeTags - HTML tags to exclude
              * onlyMainContent - Extract main content only
                
              Request Options:
              * headers - Custom HTTP headers
              * timeout - Request timeout (ms)
              * mobile - Use mobile user agent
              * proxy - Proxy type
              
              Extraction Options:
              * extract - Content extraction config
              * jsonOptions - JSON extraction config
              * actions - Actions to perform

        Returns:
          BatchScrapeStatusResponse with:
          * Scraping status and progress
          * Scraped content for each URL
          * Success/error information

        Raises:
          Exception: If batch scrape fails
        """
        endpoint = f'/v1/batch/scrape'
        headers = self._prepare_headers(idempotency_key)
        json_data = {'urls': urls}
        if params:
            json_data.update(params)
        response = self._post_request(f'{self.api_url}{endpoint}', json_data, headers)
        if response.status_code == 200:
            try:
                id = response.json().get('id')
            except:
                raise Exception(f'Failed to parse Firecrawl response as JSON.')
            return self._monitor_job_status(id, headers, poll_interval)

        else:
            self._handle_error(response, 'start batch scrape job')


    def async_batch_scrape_urls(
            self,
            urls: List[str],
            params: Optional[ScrapeParams] = None,
            idempotency_key: Optional[str] = None) -> BatchScrapeResponse:
        """
        Initiate a batch scrape job asynchronously.

        Args:
          urls (List[str]): List of URLs to scrape
          params (Optional[ScrapeParams]): See ScrapeParams model for configuration:
            Content Options:
            * formats - Content formats to retrieve
            * includeTags - HTML tags to include
            * excludeTags - HTML tags to exclude
            * onlyMainContent - Extract main content only
            
            Request Options:
            * headers - Custom HTTP headers
            * timeout - Request timeout (ms)
            * mobile - Use mobile user agent
            * proxy - Proxy type
            
            Extraction Options:
            * extract - Content extraction config
            * jsonOptions - JSON extraction config
            * actions - Actions to perform
          idempotency_key (Optional[str]): Unique key to prevent duplicate requests

        Returns:
          BatchScrapeResponse with:
          * success - Whether job started successfully
          * id - Unique identifier for the job
          * url - Status check URL
          * error - Error message if start failed

        Raises:
          Exception: If job initiation fails
        """
        endpoint = f'/v1/batch/scrape'
        headers = self._prepare_headers(idempotency_key)
        json_data = {'urls': urls}
        if params:
            json_data.update(params)
        response = self._post_request(f'{self.api_url}{endpoint}', json_data, headers)
        if response.status_code == 200:
            try:
                return response.json()
            except:
                raise Exception(f'Failed to parse Firecrawl response as JSON.')
        else:
            self._handle_error(response, 'start batch scrape job')
    
    def batch_scrape_urls_and_watch(
            self,
            urls: List[str],
            params: Optional[ScrapeParams] = None,
            idempotency_key: Optional[str] = None) -> 'CrawlWatcher':
        """
        Initiate a batch scrape job and return a CrawlWatcher to monitor the job via WebSocket.

        Args:
            urls (List[str]): List of URLs to scrape
            params (Optional[ScrapeParams]): See ScrapeParams model for configuration:

              Content Options:
              * formats - Content formats to retrieve
              * includeTags - HTML tags to include
              * excludeTags - HTML tags to exclude
              * onlyMainContent - Extract main content only
              
              Request Options:
              * headers - Custom HTTP headers
              * timeout - Request timeout (ms)
              * mobile - Use mobile user agent
              * proxy - Proxy type
              
              Extraction Options:
              * extract - Content extraction config
              * jsonOptions - JSON extraction config
              * actions - Actions to perform
            idempotency_key (Optional[str]): Unique key to prevent duplicate requests

        Returns:
            AsyncCrawlWatcher: An instance to monitor the batch scrape job via WebSocket

        Raises:
            Exception: If batch scrape job fails to start
        """
        crawl_response = self.async_batch_scrape_urls(urls, params, idempotency_key)
        if crawl_response['success'] and 'id' in crawl_response:
            return CrawlWatcher(crawl_response['id'], self)
        else:
            raise Exception("Batch scrape job failed to start")
    
    def check_batch_scrape_status(self, id: str) -> BatchScrapeStatusResponse:
        """
        Check the status of a batch scrape job using the Firecrawl API.

        Args:
            id (str): The ID of the batch scrape job.

        Returns:
            BatchScrapeStatusResponse: The status of the batch scrape job.

        Raises:
            Exception: If the status check request fails.
        """
        endpoint = f'/v1/batch/scrape/{id}'

        headers = self._prepare_headers()
        response = self._get_request(f'{self.api_url}{endpoint}', headers)
        if response.status_code == 200:
            try:
                status_data = response.json()
            except:
                raise Exception(f'Failed to parse Firecrawl response as JSON.')
            if status_data['status'] == 'completed':
                if 'data' in status_data:
                    data = status_data['data']
                    while 'next' in status_data:
                        if len(status_data['data']) == 0:
                            break
                        next_url = status_data.get('next')
                        if not next_url:
                            logger.warning("Expected 'next' URL is missing.")
                            break
                        try:
                            status_response = self._get_request(next_url, headers)
                            if status_response.status_code != 200:
                                logger.error(f"Failed to fetch next page: {status_response.status_code}")
                                break
                            try:
                                next_data = status_response.json()
                            except:
                                raise Exception(f'Failed to parse Firecrawl response as JSON.')
                            data.extend(next_data.get('data', []))
                            status_data = next_data
                        except Exception as e:
                            logger.error(f"Error during pagination request: {e}")
                            break
                    status_data['data'] = data

            response = {
                'status': status_data.get('status'),
                'total': status_data.get('total'),
                'completed': status_data.get('completed'),
                'creditsUsed': status_data.get('creditsUsed'),
                'expiresAt': status_data.get('expiresAt'),
                'data': status_data.get('data')
            }

            if 'error' in status_data:
                response['error'] = status_data['error']

            if 'next' in status_data:
                response['next'] = status_data['next']

            return {
                'success': False if 'error' in status_data else True,
                **response
            }
        else:
            self._handle_error(response, 'check batch scrape status')

    def check_batch_scrape_errors(self, id: str) -> CrawlErrorsResponse:
        """
        Returns information about batch scrape errors.

        Args:
          id (str): The ID of the crawl job.

        Returns:
            CrawlErrorsResponse: A response containing:
            * errors (List[Dict[str, str]]): List of errors with fields:
              * id (str): Error ID
              * timestamp (str): When the error occurred
              * url (str): URL that caused the error
              * error (str): Error message
            * robotsBlocked (List[str]): List of URLs blocked by robots.txt
        """
        headers = self._prepare_headers()
        response = self._get_request(f'{self.api_url}/v1/batch/scrape/{id}/errors', headers)
        if response.status_code == 200:
            try:
                return response.json()
            except:
                raise Exception(f'Failed to parse Firecrawl response as JSON.')
        else:
            self._handle_error(response, "check batch scrape errors")

    def extract(
            self,
            urls: List[str],
            params: Optional[ExtractParams] = None) -> ExtractResponse[Any]:
        """
        Extract structured information from URLs.

        Args:
            urls: URLs to extract from

            params: See ExtractParams model:

              Extraction Config:
              * prompt - Custom extraction prompt
              * schema - JSON schema/Pydantic model
              * systemPrompt - System context
              
              Behavior Options:
              * allowExternalLinks - Follow external links
              * enableWebSearch - Enable web search
              * includeSubdomains - Include subdomains
              * showSources - Include source URLs
              
              Scraping Options:
              * scrapeOptions - Page scraping config

        Returns:
            ExtractResponse with:
            * Structured data matching schema
            * Source information if requested
            * Success/error status

        Raises:
            ValueError: If prompt/schema missing or extraction fails
        """
        headers = self._prepare_headers()

        if not params or (not params.get('prompt') and not params.get('schema')):
            raise ValueError("Either prompt or schema is required")

        schema = params.get('schema')
        if schema:
            if hasattr(schema, 'model_json_schema'):
                # Convert Pydantic model to JSON schema
                schema = schema.model_json_schema()
            # Otherwise assume it's already a JSON schema dict

        request_data = {
            'urls': urls,
            'allowExternalLinks': params.get('allow_external_links', params.get('allowExternalLinks', False)),
            'enableWebSearch': params.get('enable_web_search', params.get('enableWebSearch', False)), 
            'showSources': params.get('show_sources', params.get('showSources', False)),
            'schema': schema,
            'origin': 'api-sdk'
        }

        # Only add prompt and systemPrompt if they exist
        if params.get('prompt'):
            request_data['prompt'] = params['prompt']
        if params.get('system_prompt'):
            request_data['systemPrompt'] = params['system_prompt']
        elif params.get('systemPrompt'):  # Check legacy field name
            request_data['systemPrompt'] = params['systemPrompt']

        try:
            # Send the initial extract request
            response = self._post_request(
                f'{self.api_url}/v1/extract',
                request_data,
                headers
            )
            if response.status_code == 200:
                try:
                    data = response.json()
                except:
                    raise Exception(f'Failed to parse Firecrawl response as JSON.')
                if data['success']:
                    job_id = data.get('id')
                    if not job_id:
                        raise Exception('Job ID not returned from extract request.')

                    # Poll for the extract status
                    while True:
                        status_response = self._get_request(
                            f'{self.api_url}/v1/extract/{job_id}',
                            headers
                        )
                        if status_response.status_code == 200:
                            try:
                                status_data = status_response.json()
                            except:
                                raise Exception(f'Failed to parse Firecrawl response as JSON.')
                            if status_data['status'] == 'completed':
                                return status_data
                            elif status_data['status'] in ['failed', 'cancelled']:
                                raise Exception(f'Extract job {status_data["status"]}. Error: {status_data["error"]}')
                        else:
                            self._handle_error(status_response, "extract-status")

                        time.sleep(2)  # Polling interval
                else:
                    raise Exception(f'Failed to extract. Error: {data["error"]}')
            else:
                self._handle_error(response, "extract")
        except Exception as e:
            raise ValueError(str(e), 500)

        return {'success': False, 'error': "Internal server error."}
    
    def get_extract_status(self, job_id: str) -> ExtractResponse[Any]:
        """
        Retrieve the status of an extract job.

        Args:
            job_id (str): The ID of the extract job.

        Returns:
            ExtractResponse[Any]: The status of the extract job.

        Raises:
            ValueError: If there is an error retrieving the status.
        """
        headers = self._prepare_headers()
        try:
            response = self._get_request(f'{self.api_url}/v1/extract/{job_id}', headers)
            if response.status_code == 200:
                try:
                    return response.json()
                except:
                    raise Exception(f'Failed to parse Firecrawl response as JSON.')
            else:
                self._handle_error(response, "get extract status")
        except Exception as e:
            raise ValueError(str(e), 500)

    def async_extract(
            self,
            urls: List[str],
            params: Optional[ExtractParams] = None,
            idempotency_key: Optional[str] = None) -> ExtractResponse[Any]:
        """
        Initiate an asynchronous extract job.

        Args:
            urls (List[str]): URLs to extract information from
            params (Optional[ExtractParams]): See ExtractParams model:
              Extraction Config:
              * prompt - Custom extraction prompt
              * schema - JSON schema/Pydantic model
              * systemPrompt - System context
              
              Behavior Options:
              * allowExternalLinks - Follow external links
              * enableWebSearch - Enable web search
              * includeSubdomains - Include subdomains
              * showSources - Include source URLs
              
              Scraping Options:
              * scrapeOptions - Page scraping config
            idempotency_key (Optional[str]): Unique key to prevent duplicate requests

        Returns:
          ExtractResponse containing:
          * success (bool): Whether job started successfully
          * id (str): Unique identifier for the job
          * error (str, optional): Error message if start failed

        Raises:
          ValueError: If job initiation fails
        """
        headers = self._prepare_headers(idempotency_key)
        
        schema = params.get('schema') if params else None
        if schema:
            if hasattr(schema, 'model_json_schema'):
                # Convert Pydantic model to JSON schema
                schema = schema.model_json_schema()
            # Otherwise assume it's already a JSON schema dict

        jsonData = {'urls': urls, **(params or {})}
        request_data = {
            **jsonData,
            'allowExternalLinks': params.get('allow_external_links', False) if params else False,
            'schema': schema,
            'origin': 'api-sdk'
        }

        try:
            response = self._post_request(f'{self.api_url}/v1/extract', request_data, headers)
            if response.status_code == 200:
                try:
                    return response.json()
                except:
                    raise Exception(f'Failed to parse Firecrawl response as JSON.')
            else:
                self._handle_error(response, "async extract")
        except Exception as e:
            raise ValueError(str(e), 500)

    def generate_llms_text(
            self,
            url: str,
            params: Optional[Union[Dict[str, Any], GenerateLLMsTextParams]] = None) -> GenerateLLMsTextStatusResponse:
        """
        Generate LLMs.txt for a given URL and poll until completion.

        Args:
          url: Target URL to generate LLMs.txt from

            params: See GenerateLLMsTextParams model:
            params: See GenerateLLMsTextParams model:

          params: See GenerateLLMsTextParams model:

            Generation Options:
            * maxUrls - Maximum URLs to process (default: 10)
            * showFullText - Include full text in output (default: False)

        Returns:
          GenerateLLMsTextStatusResponse with:
          * Generated LLMs.txt content
          * Full version if requested
          * Generation status
          * Success/error information

        Raises:
          Exception: If generation fails
        """
        if params is None:
            params = {}

        if isinstance(params, dict):
            generation_params = GenerateLLMsTextParams(**params)
        else:
            generation_params = params

        response = self.async_generate_llms_text(url, generation_params)
        if not response.get('success') or 'id' not in response:
            return response

        job_id = response['id']
        while True:
            status = self.check_generate_llms_text_status(job_id)
            
            if status['status'] == 'completed':
                return status
            elif status['status'] == 'failed':
                raise Exception(f'LLMs.txt generation failed. Error: {status.get("error")}')
            elif status['status'] != 'processing':
                break

            time.sleep(2)  # Polling interval

        return {'success': False, 'error': 'LLMs.txt generation job terminated unexpectedly'}

    def async_generate_llms_text(
            self,
            url: str,
            params: Optional[Union[Dict[str, Any], GenerateLLMsTextParams]] = None) -> GenerateLLMsTextResponse:
        """
        Initiate an asynchronous LLMs.txt generation operation.

        Args:
          url (str): The target URL to generate LLMs.txt from. Must be a valid HTTP/HTTPS URL.
          params (Optional[Union[Dict[str, Any], GenerateLLMsTextParams]]): Generation configuration parameters:
            * maxUrls (int, optional): Maximum number of URLs to process (default: 10)
            * showFullText (bool, optional): Include full text in output (default: False)

        Returns:
          GenerateLLMsTextResponse: A response containing:
            - success (bool): Whether the generation initiation was successful
            - id (str): The unique identifier for the generation job
            - error (str, optional): Error message if initiation failed

        Raises:
          Exception: If the generation job initiation fails.
        """
        if params is None:
            params = {}

        if isinstance(params, dict):
            generation_params = GenerateLLMsTextParams(**params)
        else:
            generation_params = params

        headers = self._prepare_headers()
        json_data = {'url': url, **generation_params.dict(exclude_none=True)}

        try:
            response = self._post_request(f'{self.api_url}/v1/llmstxt', json_data, headers)
            if response.status_code == 200:
                try:
                    return response.json()
                except:
                    raise Exception('Failed to parse Firecrawl response as JSON.')
            else:
                self._handle_error(response, 'start LLMs.txt generation')
        except Exception as e:
            raise ValueError(str(e))

        return {'success': False, 'error': 'Internal server error'}

    def check_generate_llms_text_status(self, id: str) -> GenerateLLMsTextStatusResponse:
        """
        Check the status of a LLMs.txt generation operation.

        Args:
          id (str): The unique identifier of the LLMs.txt generation job to check status for.

        Returns:
          GenerateLLMsTextStatusResponse: A response containing:
          * success (bool): Whether the generation was successful
          * status (str): Status of generation ("processing", "completed", "failed")
          * data (Dict[str, str], optional): Generated text with fields:
            * llmstxt (str): Generated LLMs.txt content
            * llmsfulltxt (str, optional): Full version if requested
          * error (str, optional): Error message if generation failed
          * expiresAt (str): When the generated data expires

        Raises:
          Exception: If the status check fails.
        """
        headers = self._prepare_headers()
        try:
            response = self._get_request(f'{self.api_url}/v1/llmstxt/{id}', headers)
            if response.status_code == 200:
                try:
                    return response.json()
                except:
                    raise Exception('Failed to parse Firecrawl response as JSON.')
            elif response.status_code == 404:
                raise Exception('LLMs.txt generation job not found')
            else:
                self._handle_error(response, 'check LLMs.txt generation status')
        except Exception as e:
            raise ValueError(str(e))

        return {'success': False, 'error': 'Internal server error'}

    def _prepare_headers(
            self,
            idempotency_key: Optional[str] = None) -> Dict[str, str]:
        """
        Prepare the headers for API requests.

        Args:
            idempotency_key (Optional[str]): A unique key to ensure idempotency of requests.

        Returns:
            Dict[str, str]: The headers including content type, authorization, and optionally idempotency key.
        """
        if idempotency_key:
            return {
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {self.api_key}',
                'x-idempotency-key': idempotency_key
            }

        return {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.api_key}',
        }

    def _post_request(
            self,
            url: str,
            data: Dict[str, Any],
            headers: Dict[str, str],
            retries: int = 3,
            backoff_factor: float = 0.5) -> requests.Response:
        """
        Make a POST request with retries.

        Args:
            url (str): The URL to send the POST request to.
            data (Dict[str, Any]): The JSON data to include in the POST request.
            headers (Dict[str, str]): The headers to include in the POST request.
            retries (int): Number of retries for the request.
            backoff_factor (float): Backoff factor for retries.

        Returns:
            requests.Response: The response from the POST request.

        Raises:
            requests.RequestException: If the request fails after the specified retries.
        """
        for attempt in range(retries):
            response = requests.post(url, headers=headers, json=data, timeout=((data["timeout"] + 5000) if "timeout" in data else None))
            if response.status_code == 502:
                time.sleep(backoff_factor * (2 ** attempt))
            else:
                return response
        return response

    def _get_request(
            self,
            url: str,
            headers: Dict[str, str],
            retries: int = 3,
            backoff_factor: float = 0.5) -> requests.Response:
        """
        Make a GET request with retries.

        Args:
            url (str): The URL to send the GET request to.
            headers (Dict[str, str]): The headers to include in the GET request.
            retries (int): Number of retries for the request.
            backoff_factor (float): Backoff factor for retries.

        Returns:
            requests.Response: The response from the GET request.

        Raises:
            requests.RequestException: If the request fails after the specified retries.
        """
        for attempt in range(retries):
            response = requests.get(url, headers=headers)
            if response.status_code == 502:
                time.sleep(backoff_factor * (2 ** attempt))
            else:
                return response
        return response
    
    def _delete_request(
            self,
            url: str,
            headers: Dict[str, str],
            retries: int = 3,
            backoff_factor: float = 0.5) -> requests.Response:
        """
        Make a DELETE request with retries.

        Args:
            url (str): The URL to send the DELETE request to.
            headers (Dict[str, str]): The headers to include in the DELETE request.
            retries (int): Number of retries for the request.
            backoff_factor (float): Backoff factor for retries.

        Returns:
            requests.Response: The response from the DELETE request.

        Raises:
            requests.RequestException: If the request fails after the specified retries.
        """
        for attempt in range(retries):
            response = requests.delete(url, headers=headers)
            if response.status_code == 502:
                time.sleep(backoff_factor * (2 ** attempt))
            else:
                return response
        return response

    def _monitor_job_status(
            self,
            id: str,
            headers: Dict[str, str],
            poll_interval: int) -> CrawlStatusResponse:
        """
        Monitor the status of a crawl job until completion.

        Args:
            id (str): The ID of the crawl job.
            headers (Dict[str, str]): The headers to include in the status check requests.
            poll_interval (int): Seconds between status checks.

        Returns:
            CrawlStatusResponse: The crawl results if the job is completed successfully.

        Raises:
            Exception: If the job fails or an error occurs during status checks.
        """
        while True:
            api_url = f'{self.api_url}/v1/crawl/{id}'

            status_response = self._get_request(api_url, headers)
            if status_response.status_code == 200:
                try:
                    status_data = status_response.json()
                except:
                    raise Exception(f'Failed to parse Firecrawl response as JSON.')
                if status_data['status'] == 'completed':
                    if 'data' in status_data:
                        data = status_data['data']
                        while 'next' in status_data:
                            if len(status_data['data']) == 0:
                                break
                            status_response = self._get_request(status_data['next'], headers)
                            try:
                                status_data = status_response.json()
                            except:
                                raise Exception(f'Failed to parse Firecrawl response as JSON.')
                            data.extend(status_data.get('data', []))
                        status_data['data'] = data
                        return status_data
                    else:
                        raise Exception('Crawl job completed but no data was returned')
                elif status_data['status'] in ['active', 'paused', 'pending', 'queued', 'waiting', 'scraping']:
                    poll_interval=max(poll_interval,2)
                    time.sleep(poll_interval)  # Wait for the specified interval before checking again
                else:
                    raise Exception(f'Crawl job failed or was stopped. Status: {status_data["status"]}')
            else:
                self._handle_error(status_response, 'check crawl status')

    def _handle_error(
            self,
            response: requests.Response,
            action: str) -> None:
        """
        Handle errors from API responses.

        Args:
            response (requests.Response): The response object from the API request.
            action (str): Description of the action that was being performed.

        Raises:
            Exception: An exception with a message containing the status code and error details from the response.
        """
        try:
            error_message = response.json().get('error', 'No error message provided.')
            error_details = response.json().get('details', 'No additional error details provided.')
        except:
            raise requests.exceptions.HTTPError(f'Failed to parse Firecrawl error response as JSON. Status code: {response.status_code}', response=response)
        
        message = self._get_error_message(response.status_code, action, error_message, error_details)

        # Raise an HTTPError with the custom message and attach the response
        raise requests.exceptions.HTTPError(message, response=response)

    def _get_error_message(self, status_code: int, action: str, error_message: str, error_details: str) -> str:
        """
        Generate a standardized error message based on HTTP status code.
        
        Args:
            status_code (int): The HTTP status code from the response
            action (str): Description of the action that was being performed
            error_message (str): The error message from the API response
            error_details (str): Additional error details from the API response
            
        Returns:
            str: A formatted error message
        """
        if status_code == 402:
            return f"Payment Required: Failed to {action}. {error_message} - {error_details}"
        elif status_code == 408:
            return f"Request Timeout: Failed to {action} as the request timed out. {error_message} - {error_details}"
        elif status_code == 409:
            return f"Conflict: Failed to {action} due to a conflict. {error_message} - {error_details}"
        elif status_code == 500:
            return f"Internal Server Error: Failed to {action}. {error_message} - {error_details}"
        else:
            return f"Unexpected error during {action}: Status code {status_code}. {error_message} - {error_details}"

    def deep_research(
            self,
            query: str,
            params: Optional[Union[Dict[str, Any], DeepResearchParams]] = None, 
            on_activity: Optional[Callable[[Dict[str, Any]], None]] = None,
            on_source: Optional[Callable[[Dict[str, Any]], None]] = None) -> DeepResearchStatusResponse:
        """
        Initiates a deep research operation on a given query and polls until completion.

        Args:
          query: Research query or topic to investigate

          params: See DeepResearchParams model:
            Research Settings:
              * maxDepth - Maximum research depth (default: 7)
              * timeLimit - Time limit in seconds (default: 270)
              * maxUrls - Maximum URLs to process (default: 20)

          Callbacks:
          * on_activity - Progress callback receiving:
              {type, status, message, timestamp, depth}
          * on_source - Source discovery callback receiving:
              {url, title, description}

        Returns:
          DeepResearchResponse containing:

          Status:
          * success - Whether research completed successfully
          * status - Current state (processing/completed/failed)
          * error - Error message if failed
          
          Results:
          * id - Unique identifier for the research job
          * data - Research findings and analysis
          * sources - List of discovered sources
          * activities - Research progress log
          * summaries - Generated research summaries

        Raises:
          Exception: If research fails
        """
        if params is None:
            params = {}

        if isinstance(params, dict):
            research_params = DeepResearchParams(**params)
        else:
            research_params = params

        response = self.async_deep_research(query, research_params)
        if not response.get('success') or 'id' not in response:
            return response

        job_id = response['id']
        last_activity_count = 0
        last_source_count = 0

        while True:
            status = self.check_deep_research_status(job_id)
            
            if on_activity and 'activities' in status:
                new_activities = status['activities'][last_activity_count:]
                for activity in new_activities:
                    on_activity(activity)
                last_activity_count = len(status['activities'])
            
            if on_source and 'sources' in status:
                new_sources = status['sources'][last_source_count:]
                for source in new_sources:
                    on_source(source)
                last_source_count = len(status['sources'])
            
            if status['status'] == 'completed':
                return status
            elif status['status'] == 'failed':
                raise Exception(f'Deep research failed. Error: {status.get("error")}')
            elif status['status'] != 'processing':
                break

            time.sleep(2)  # Polling interval

        return {'success': False, 'error': 'Deep research job terminated unexpectedly'}

    def async_deep_research(
            self,
            query: str,
            params: Optional[Union[Dict[str, Any], DeepResearchParams]] = None) -> DeepResearchResponse:
        """
        Initiates an asynchronous deep research operation.

        Args:
            query (str): The research query to investigate. Should be a clear, specific question or topic.
            params (Optional[Union[Dict[str, Any], DeepResearchParams]]): Research configuration parameters:
              * maxDepth (int, optional): Maximum depth of research exploration (default: 7)
              * timeLimit (int, optional): Time limit in seconds for research (default: 270)
              * maxUrls (int, optional): Maximum number of URLs to process (default: 20)

        Returns:
          DeepResearchResponse: A response containing:
            * success (bool): Whether the research initiation was successful
            * id (str): The unique identifier for the research job
            * error (str, optional): Error message if initiation failed

        Raises:
            Exception: If the research initiation fails.
        """
        if params is None:
            params = {}

        if isinstance(params, dict):
            research_params = DeepResearchParams(**params)
        else:
            research_params = params

        headers = self._prepare_headers()
        json_data = {'query': query, **research_params.dict(exclude_none=True)}

        try:
            response = self._post_request(f'{self.api_url}/v1/deep-research', json_data, headers)
            if response.status_code == 200:
                try:
                    return response.json()
                except:
                    raise Exception('Failed to parse Firecrawl response as JSON.')
            else:
                self._handle_error(response, 'start deep research')
        except Exception as e:
            raise ValueError(str(e))

        return {'success': False, 'error': 'Internal server error'}

    def check_deep_research_status(self, id: str) -> DeepResearchStatusResponse:
        """
        Check the status of a deep research operation.

        Args:
            id (str): The ID of the deep research operation.

        Returns:
            DeepResearchResponse containing:

            Status:
            * success - Whether research completed successfully
            * status - Current state (processing/completed/failed)
            * error - Error message if failed
            
            Results:
            * id - Unique identifier for the research job
            * data - Research findings and analysis
            * sources - List of discovered sources
            * activities - Research progress log
            * summaries - Generated research summaries

        Raises:
            Exception: If the status check fails.
        """
        headers = self._prepare_headers()
        try:
            response = self._get_request(f'{self.api_url}/v1/deep-research/{id}', headers)
            if response.status_code == 200:
                try:
                    return response.json()
                except:
                    raise Exception('Failed to parse Firecrawl response as JSON.')
            elif response.status_code == 404:
                raise Exception('Deep research job not found')
            else:
                self._handle_error(response, 'check deep research status')
        except Exception as e:
            raise ValueError(str(e))

        return {'success': False, 'error': 'Internal server error'}

class CrawlWatcher:
    """
    A class to watch and handle crawl job events via WebSocket connection.

    Attributes:
        id (str): The ID of the crawl job to watch
        app (FirecrawlApp): The FirecrawlApp instance
        data (List[Dict[str, Any]]): List of crawled documents/data
        status (str): Current status of the crawl job
        ws_url (str): WebSocket URL for the crawl job
        event_handlers (dict): Dictionary of event type to list of handler functions
    """
    def __init__(self, id: str, app: FirecrawlApp):
        self.id = id
        self.app = app
        self.data: List[Dict[str, Any]] = []
        self.status = "scraping"
        self.ws_url = f"{app.api_url.replace('http', 'ws')}/v1/crawl/{id}"
        self.event_handlers = {
            'done': [],
            'error': [],
            'document': []
        }

    async def connect(self) -> None:
        """
        Establishes WebSocket connection and starts listening for messages.
        """
        async with websockets.connect(self.ws_url, extra_headers={"Authorization": f"Bearer {self.app.api_key}"}) as websocket:
            await self._listen(websocket)

    async def _listen(self, websocket) -> None:
        """
        Listens for incoming WebSocket messages and handles them.

        Args:
            websocket: The WebSocket connection object
        """
        async for message in websocket:
            msg = json.loads(message)
            await self._handle_message(msg)

    def add_event_listener(self, event_type: str, handler: Callable[[Dict[str, Any]], None]) -> None:
        """
        Adds an event handler function for a specific event type.

        Args:
            event_type (str): Type of event to listen for ('done', 'error', or 'document')
            handler (Callable): Function to handle the event
        """
        if event_type in self.event_handlers:
            self.event_handlers[event_type].append(handler)

    def dispatch_event(self, event_type: str, detail: Dict[str, Any]) -> None:
        """
        Dispatches an event to all registered handlers for that event type.

        Args:
            event_type (str): Type of event to dispatch
            detail (Dict[str, Any]): Event details/data to pass to handlers
        """
        if event_type in self.event_handlers:
            for handler in self.event_handlers[event_type]:
                handler(detail)

    async def _handle_message(self, msg: Dict[str, Any]) -> None:
        """
        Handles incoming WebSocket messages based on their type.

        Args:
            msg (Dict[str, Any]): The message to handle
        """
        if msg['type'] == 'done':
            self.status = 'completed'
            self.dispatch_event('done', {'status': self.status, 'data': self.data, 'id': self.id})
        elif msg['type'] == 'error':
            self.status = 'failed'
            self.dispatch_event('error', {'status': self.status, 'data': self.data, 'error': msg['error'], 'id': self.id})
        elif msg['type'] == 'catchup':
            self.status = msg['data']['status']
            self.data.extend(msg['data'].get('data', []))
            for doc in self.data:
                self.dispatch_event('document', {'data': doc, 'id': self.id})
        elif msg['type'] == 'document':
            self.data.append(msg['data'])
            self.dispatch_event('document', {'data': msg['data'], 'id': self.id})

class AsyncFirecrawlApp(FirecrawlApp):
    """
    Asynchronous version of FirecrawlApp that implements async methods using aiohttp.
    Provides non-blocking alternatives to all FirecrawlApp operations.
    """

    async def _async_request(
            self,
            method: str,
            url: str,
            headers: Dict[str, str],
            data: Optional[Dict[str, Any]] = None,
            retries: int = 3,
            backoff_factor: float = 0.5) -> Dict[str, Any]:
        """
        Generic async request method with exponential backoff retry logic.

        Args:
            method (str): The HTTP method to use (e.g., "GET" or "POST").
            url (str): The URL to send the request to.
            headers (Dict[str, str]): Headers to include in the request.
            data (Optional[Dict[str, Any]]): The JSON data to include in the request body (only for POST requests).
            retries (int): Maximum number of retry attempts (default: 3).
            backoff_factor (float): Factor to calculate delay between retries (default: 0.5).
                Delay will be backoff_factor * (2 ** retry_count).

        Returns:
            Dict[str, Any]: The parsed JSON response from the server.

        Raises:
            aiohttp.ClientError: If the request fails after all retries.
            Exception: If max retries are exceeded or other errors occur.
        """
        async with aiohttp.ClientSession() as session:
            for attempt in range(retries):
                try:
                    async with session.request(
                        method=method, url=url, headers=headers, json=data
                    ) as response:
                        if response.status == 502:
                            await asyncio.sleep(backoff_factor * (2 ** attempt))
                            continue
                        if response.status >= 300:
                            await self._handle_error(response, f"make {method} request")
                        return await response.json()
                except aiohttp.ClientError as e:
                    if attempt == retries - 1:
                        raise e
                    await asyncio.sleep(backoff_factor * (2 ** attempt))
            raise Exception("Max retries exceeded")

    async def _async_post_request(
            self, url: str, data: Dict[str, Any], headers: Dict[str, str],
            retries: int = 3, backoff_factor: float = 0.5) -> Dict[str, Any]:
        """
        Make an async POST request with exponential backoff retry logic.

        Args:
            url (str): The URL to send the POST request to.
            data (Dict[str, Any]): The JSON data to include in the request body.
            headers (Dict[str, str]): Headers to include in the request.
            retries (int): Maximum number of retry attempts (default: 3).
            backoff_factor (float): Factor to calculate delay between retries (default: 0.5).
                Delay will be backoff_factor * (2 ** retry_count).

        Returns:
            Dict[str, Any]: The parsed JSON response from the server.

        Raises:
            aiohttp.ClientError: If the request fails after all retries.
            Exception: If max retries are exceeded or other errors occur.
        """
        return await self._async_request("POST", url, headers, data, retries, backoff_factor)

    async def _async_get_request(
            self, url: str, headers: Dict[str, str],
            retries: int = 3, backoff_factor: float = 0.5) -> Dict[str, Any]:
        """
        Make an async GET request with exponential backoff retry logic.

        Args:
            url (str): The URL to send the GET request to.
            headers (Dict[str, str]): Headers to include in the request.
            retries (int): Maximum number of retry attempts (default: 3).
            backoff_factor (float): Factor to calculate delay between retries (default: 0.5).
                Delay will be backoff_factor * (2 ** retry_count).

        Returns:
            Dict[str, Any]: The parsed JSON response from the server.

        Raises:
            aiohttp.ClientError: If the request fails after all retries.
            Exception: If max retries are exceeded or other errors occur.
        """
        return await self._async_request("GET", url, headers, None, retries, backoff_factor)

    async def _handle_error(self, response: aiohttp.ClientResponse, action: str) -> None:
        """
        Handle errors from async API responses with detailed error messages.

        Args:
            response (aiohttp.ClientResponse): The response object from the failed request
            action (str): Description of the action that was being attempted

        Raises:
            aiohttp.ClientError: With a detailed error message based on the response status:
                - 402: Payment Required
                - 408: Request Timeout
                - 409: Conflict
                - 500: Internal Server Error
                - Other: Unexpected error with status code
        """
        try:
            error_data = await response.json()
            error_message = error_data.get('error', 'No error message provided.')
            error_details = error_data.get('details', 'No additional error details provided.')
        except:
            raise aiohttp.ClientError(f'Failed to parse Firecrawl error response as JSON. Status code: {response.status}')

        message = await self._get_async_error_message(response.status, action, error_message, error_details)

        raise aiohttp.ClientError(message)

    async def _get_async_error_message(self, status_code: int, action: str, error_message: str, error_details: str) -> str:
        """
        Generate a standardized error message based on HTTP status code for async operations.
        
        Args:
            status_code (int): The HTTP status code from the response
            action (str): Description of the action that was being performed
            error_message (str): The error message from the API response
            error_details (str): Additional error details from the API response
            
        Returns:
            str: A formatted error message
        """
        return self._get_error_message(status_code, action, error_message, error_details)

    async def crawl_url_and_watch(
            self,
            url: str,
            params: Optional[CrawlParams] = None,
            idempotency_key: Optional[str] = None) -> 'AsyncCrawlWatcher':
        """
        Initiate an async crawl job and return an AsyncCrawlWatcher to monitor progress via WebSocket.

        Args:
          url (str): Target URL to start crawling from
          params (Optional[CrawlParams]): See CrawlParams model for configuration:
            URL Discovery:
            * includePaths - Patterns of URLs to include
            * excludePaths - Patterns of URLs to exclude
            * maxDepth - Maximum crawl depth
            * maxDiscoveryDepth - Maximum depth for finding new URLs
            * limit - Maximum pages to crawl

            Link Following:
            * allowBackwardLinks - Follow parent directory links
            * allowExternalLinks - Follow external domain links  
            * ignoreSitemap - Skip sitemap.xml processing

            Advanced:
            * scrapeOptions - Page scraping configuration
            * webhook - Notification webhook settings
            * deduplicateSimilarURLs - Remove similar URLs
            * ignoreQueryParameters - Ignore URL parameters
            * regexOnFullURL - Apply regex to full URLs
          idempotency_key (Optional[str]): Unique key to prevent duplicate requests

        Returns:
          AsyncCrawlWatcher: An instance to monitor the crawl job via WebSocket

        Raises:
          Exception: If crawl job fails to start
        """
        crawl_response = await self.async_crawl_url(url, params, idempotency_key)
        if crawl_response.get('success') and 'id' in crawl_response:
            return AsyncCrawlWatcher(crawl_response['id'], self)
        else:
            raise Exception("Crawl job failed to start")

    async def batch_scrape_urls_and_watch(
            self,
            urls: List[str],
            params: Optional[ScrapeParams] = None,
            idempotency_key: Optional[str] = None) -> 'AsyncCrawlWatcher':
        """
        Initiate an async batch scrape job and return an AsyncCrawlWatcher to monitor progress.

        Args:
            urls (List[str]): List of URLs to scrape
            params (Optional[ScrapeParams]): See ScrapeParams model for configuration:

              Content Options:
              * formats - Content formats to retrieve
              * includeTags - HTML tags to include
              * excludeTags - HTML tags to exclude
              * onlyMainContent - Extract main content only
              
              Request Options:
              * headers - Custom HTTP headers
              * timeout - Request timeout (ms)
              * mobile - Use mobile user agent
              * proxy - Proxy type
              
              Extraction Options:
              * extract - Content extraction config
              * jsonOptions - JSON extraction config
              * actions - Actions to perform
            idempotency_key (Optional[str]): Unique key to prevent duplicate requests

        Returns:
            AsyncCrawlWatcher: An instance to monitor the batch scrape job via WebSocket

        Raises:
            Exception: If batch scrape job fails to start
        """
        batch_response = await self.async_batch_scrape_urls(urls, params, idempotency_key)
        if batch_response.get('success') and 'id' in batch_response:
            return AsyncCrawlWatcher(batch_response['id'], self)
        else:
            raise Exception("Batch scrape job failed to start")

    async def scrape_url(
            self,
            url: str,
            params: Optional[ScrapeParams] = None) -> ScrapeResponse[Any]:
        """
        Asynchronously scrape and extract content from a URL.

        Args:
            url (str): Target URL to scrape
            params (Optional[ScrapeParams]): See ScrapeParams model for configuration:
              Content Options:
              * formats - Content types to retrieve (markdown/html/etc)
              * includeTags - HTML tags to include
              * excludeTags - HTML tags to exclude
              * onlyMainContent - Extract main content only
                  
              Request Options:
              * headers - Custom HTTP headers
              * timeout - Request timeout (ms)
              * mobile - Use mobile user agent
              * proxy - Proxy type (basic/stealth)
                  
              Extraction Options:
              * extract - Content extraction settings
              * jsonOptions - JSON extraction settings
              * actions - Actions to perform

        Returns:
          ScrapeResponse with:
          * Requested content formats
          * Page metadata
          * Extraction results
          * Success/error status

        Raises:
            Exception: If scraping fails
        """
        headers = self._prepare_headers()
        scrape_params = {'url': url}

        if params:
            extract = params.get('extract', {})
            if extract:
                if 'schema' in extract and hasattr(extract['schema'], 'schema'):
                    extract['schema'] = extract['schema'].schema()
                scrape_params['extract'] = extract

            for key, value in params.items():
                if key not in ['extract']:
                    scrape_params[key] = value

        endpoint = f'/v1/scrape'
        response = await self._async_post_request(
            f'{self.api_url}{endpoint}',
            scrape_params,
            headers
        )
        
        if response.get('success') and 'data' in response:
            return response['data']
        elif "error" in response:
            raise Exception(f'Failed to scrape URL. Error: {response["error"]}')
        else:
            raise Exception(f'Failed to scrape URL. Error: {response}')

    async def batch_scrape_urls(
            self,
            urls: List[str],
            params: Optional[ScrapeParams] = None) -> BatchScrapeStatusResponse:
        """
        Asynchronously scrape multiple URLs and monitor until completion.

        Args:
            urls (List[str]): URLs to scrape
            params (Optional[ScrapeParams]): See ScrapeParams model:
              Content Options:
              * formats - Content formats to retrieve
              * includeTags - HTML tags to include
              * excludeTags - HTML tags to exclude
              * onlyMainContent - Extract main content only
                
              Request Options:
              * headers - Custom HTTP headers
              * timeout - Request timeout (ms)
              * mobile - Use mobile user agent
              * proxy - Proxy type
              
              Extraction Options:
              * extract - Content extraction config
              * jsonOptions - JSON extraction config
              * actions - Actions to perform

        Returns:
          BatchScrapeStatusResponse with:
          * Scraping status and progress
          * Scraped content for each URL
          * Success/error information

        Raises:
          Exception: If batch scrape fails
        """
        headers = self._prepare_headers()
        json_data = {'urls': urls}
        if params:
            json_data.update(params)

        endpoint = f'/v1/batch/scrape'
        response = await self._async_post_request(
            f'{self.api_url}{endpoint}',
            json_data,
            headers
        )

        if response.get('success') and 'id' in response:
            return await self._async_monitor_job_status(response['id'], headers)
        else:
            raise Exception(f'Failed to start batch scrape. Error: {response.get("error")}')

    async def async_batch_scrape_urls(
            self,
            urls: List[str],
            params: Optional[ScrapeParams] = None,
            idempotency_key: Optional[str] = None) -> BatchScrapeResponse:
        """
        Initiate an asynchronous batch scrape job without waiting for completion.

        Args:
          urls (List[str]): List of URLs to scrape
          params (Optional[ScrapeParams]): See ScrapeParams model for configuration:
            Content Options:
            * formats - Content formats to retrieve
            * includeTags - HTML tags to include
            * excludeTags - HTML tags to exclude
            * onlyMainContent - Extract main content only
            
            Request Options:
            * headers - Custom HTTP headers
            * timeout - Request timeout (ms)
            * mobile - Use mobile user agent
            * proxy - Proxy type
            
            Extraction Options:
            * extract - Content extraction config
            * jsonOptions - JSON extraction config
            * actions - Actions to perform
          idempotency_key (Optional[str]): Unique key to prevent duplicate requests

        Returns:
          BatchScrapeResponse with:
          * success - Whether job started successfully
          * id - Unique identifier for the job
          * url - Status check URL
          * error - Error message if start failed

        Raises:
          Exception: If job initiation fails
        """
        headers = self._prepare_headers(idempotency_key)
        json_data = {'urls': urls}
        if params:
            json_data.update(params)

        endpoint = f'/v1/batch/scrape'
        return await self._async_post_request(
            f'{self.api_url}{endpoint}',
            json_data,
            headers
        )

    async def crawl_url(
            self,
            url: str,
            params: Optional[CrawlParams] = None,
            poll_interval: int = 2,
            idempotency_key: Optional[str] = None) -> CrawlStatusResponse:
        """
        Asynchronously crawl a website starting from a URL and monitor until completion.

        Args:
          url (str): Target URL to start crawling from
          params (Optional[CrawlParams]): See CrawlParams model:
            URL Discovery:
            * includePaths - Patterns of URLs to include
            * excludePaths - Patterns of URLs to exclude
            * maxDepth - Maximum crawl depth
            * maxDiscoveryDepth - Maximum depth for finding new URLs
            * limit - Maximum pages to crawl

            Link Following:
            * allowBackwardLinks - Follow parent directory links
            * allowExternalLinks - Follow external domain links  
            * ignoreSitemap - Skip sitemap.xml processing

            Advanced:
            * scrapeOptions - Page scraping configuration
            * webhook - Notification webhook settings
            * deduplicateSimilarURLs - Remove similar URLs
            * ignoreQueryParameters - Ignore URL parameters
            * regexOnFullURL - Apply regex to full URLs
          poll_interval (int): Seconds between status checks (default: 2)
          idempotency_key (Optional[str]): Unique key to prevent duplicate requests

        Returns:
          CrawlStatusResponse with:
          * Crawling status and progress
          * Crawled page contents
          * Success/error information

        Raises:
          Exception: If crawl fails
        """
        headers = self._prepare_headers(idempotency_key)
        json_data = {'url': url}
        if params:
            json_data.update(params)

        endpoint = f'/v1/crawl'
        response = await self._async_post_request(
            f'{self.api_url}{endpoint}',
            json_data,
            headers
        )

        if response.get('success') and 'id' in response:
            return await self._async_monitor_job_status(response['id'], headers, poll_interval)
        else:
            raise Exception(f'Failed to start crawl. Error: {response.get("error")}')

    async def async_crawl_url(
            self,
            url: str,
            params: Optional[CrawlParams] = None,
            idempotency_key: Optional[str] = None) -> CrawlResponse:
        """
        Initiate an asynchronous crawl job without waiting for completion.

        Args:
            url (str): Target URL to start crawling from
            params (Optional[CrawlParams]): See CrawlParams model:
              URL Discovery:
              * includePaths - Patterns of URLs to include
              * excludePaths - Patterns of URLs to exclude
              * maxDepth - Maximum crawl depth
              * maxDiscoveryDepth - Maximum depth for finding new URLs
              * limit - Maximum pages to crawl

              Link Following:
              * allowBackwardLinks - Follow parent directory links
              * allowExternalLinks - Follow external domain links  
              * ignoreSitemap - Skip sitemap.xml processing

              Advanced:
              * scrapeOptions - Page scraping configuration
              * webhook - Notification webhook settings
              * deduplicateSimilarURLs - Remove similar URLs
              * ignoreQueryParameters - Ignore URL parameters
              * regexOnFullURL - Apply regex to full URLs
            idempotency_key (Optional[str]): Unique key to prevent duplicate requests

        Returns:
          CrawlResponse with:
          * success - Whether job started successfully
          * id - Unique identifier for the job
          * url - Status check URL
          * error - Error message if start failed

        Raises:
          Exception: If job initiation fails
        """
        headers = self._prepare_headers(idempotency_key)
        json_data = {'url': url}
        if params:
            json_data.update(params)

        endpoint = f'/v1/crawl'
        return await self._async_post_request(
            f'{self.api_url}{endpoint}',
            json_data,
            headers
        )

    async def check_crawl_status(self, id: str) -> CrawlStatusResponse:
        """
        Check the status and results of an asynchronous crawl job.

        Args:
            id (str): Unique identifier for the crawl job

        Returns:
            CrawlStatusResponse containing:
            Status Information:
            * status - Current state (scraping/completed/failed/cancelled)
            * completed - Number of pages crawled
            * total - Total pages to crawl
            * creditsUsed - API credits consumed
            * expiresAt - Data expiration timestamp
            
            Results:
            * data - List of crawled documents
            * next - URL for next page of results (if paginated)
            * success - Whether status check succeeded
            * error - Error message if failed

        Raises:
            Exception: If status check fails
        """
        headers = self._prepare_headers()
        endpoint = f'/v1/crawl/{id}'
        
        status_data = await self._async_get_request(
            f'{self.api_url}{endpoint}',
            headers
        )

        if status_data['status'] == 'completed':
            if 'data' in status_data:
                data = status_data['data']
                while 'next' in status_data:
                    if len(status_data['data']) == 0:
                        break
                    next_url = status_data.get('next')
                    if not next_url:
                        logger.warning("Expected 'next' URL is missing.")
                        break
                    next_data = await self._async_get_request(next_url, headers)
                    data.extend(next_data.get('data', []))
                    status_data = next_data
                status_data['data'] = data

        response = {
            'status': status_data.get('status'),
            'total': status_data.get('total'),
            'completed': status_data.get('completed'),
            'creditsUsed': status_data.get('creditsUsed'),
            'expiresAt': status_data.get('expiresAt'),
            'data': status_data.get('data')
        }

        if 'error' in status_data:
            response['error'] = status_data['error']

        if 'next' in status_data:
            response['next'] = status_data['next']

        return {
            'success': False if 'error' in status_data else True,
            **response
        }

    async def _async_monitor_job_status(self, id: str, headers: Dict[str, str], poll_interval: int = 2) -> CrawlStatusResponse:
        """
        Monitor the status of an asynchronous job until completion.

        Args:
            id (str): The ID of the job to monitor
            headers (Dict[str, str]): Headers to include in status check requests
            poll_interval (int): Seconds between status checks (default: 2)

        Returns:
            CrawlStatusResponse: The job results if completed successfully

        Raises:
            Exception: If the job fails or an error occurs during status checks
        """
        while True:
            status_data = await self._async_get_request(
                f'{self.api_url}/v1/crawl/{id}',
                headers
            )

            if status_data['status'] == 'completed':
                if 'data' in status_data:
                    data = status_data['data']
                    while 'next' in status_data:
                        if len(status_data['data']) == 0:
                            break
                        next_url = status_data.get('next')
                        if not next_url:
                            logger.warning("Expected 'next' URL is missing.")
                            break
                        next_data = await self._async_get_request(next_url, headers)
                        data.extend(next_data.get('data', []))
                        status_data = next_data
                    status_data['data'] = data
                    return status_data
                else:
                    raise Exception('Job completed but no data was returned')
            elif status_data['status'] in ['active', 'paused', 'pending', 'queued', 'waiting', 'scraping']:
                await asyncio.sleep(max(poll_interval, 2))
            else:
                raise Exception(f'Job failed or was stopped. Status: {status_data["status"]}')

    async def map_url(
            self,
            url: str,
            params: Optional[MapParams] = None) -> MapResponse:
        """
        Asynchronously map and discover links from a URL.

        Args:
          url (str): Target URL to map
          params (Optional[MapParams]): See MapParams model:
            Discovery Options:
            * search - Filter pattern for URLs
            * ignoreSitemap - Skip sitemap.xml
            * includeSubdomains - Include subdomain links
            * sitemapOnly - Only use sitemap.xml
            
            Limits:
            * limit - Max URLs to return
            * timeout - Request timeout (ms)

        Returns:
          MapResponse with:
          * Discovered URLs
          * Success/error status

        Raises:
          Exception: If mapping fails
        """
        headers = self._prepare_headers()
        json_data = {'url': url}
        if params:
            json_data.update(params)

        endpoint = f'/v1/map'
        response = await self._async_post_request(
            f'{self.api_url}{endpoint}',
            json_data,
            headers
        )

        if response.get('success') and 'links' in response:
            return response
        elif 'error' in response:
            raise Exception(f'Failed to map URL. Error: {response["error"]}')
        else:
            raise Exception(f'Failed to map URL. Error: {response}')

    async def extract(
            self,
            urls: List[str],
            params: Optional[ExtractParams] = None) -> ExtractResponse[Any]:
        """
        Asynchronously extract structured information from URLs.

        Args:
            urls (List[str]): URLs to extract from
            params (Optional[ExtractParams]): See ExtractParams model:
              Extraction Config:
              * prompt - Custom extraction prompt
              * schema - JSON schema/Pydantic model
              * systemPrompt - System context
              
              Behavior Options:
              * allowExternalLinks - Follow external links
              * enableWebSearch - Enable web search
              * includeSubdomains - Include subdomains
              * showSources - Include source URLs
              
              Scraping Options:
              * scrapeOptions - Page scraping config

        Returns:
          ExtractResponse with:
          * Structured data matching schema
          * Source information if requested
          * Success/error status

        Raises:
          ValueError: If prompt/schema missing or extraction fails
        """
        headers = self._prepare_headers()

        if not params or (not params.get('prompt') and not params.get('schema')):
            raise ValueError("Either prompt or schema is required")

        schema = params.get('schema')
        if schema:
            if hasattr(schema, 'model_json_schema'):
                schema = schema.model_json_schema()

        request_data = {
            'urls': urls,
            'allowExternalLinks': params.get('allow_external_links', params.get('allowExternalLinks', False)),
            'enableWebSearch': params.get('enable_web_search', params.get('enableWebSearch', False)),
            'showSources': params.get('show_sources', params.get('showSources', False)),
            'schema': schema,
            'origin': 'api-sdk'
        }

        if params.get('prompt'):
            request_data['prompt'] = params['prompt']
        if params.get('system_prompt'):
            request_data['systemPrompt'] = params['system_prompt']
        elif params.get('systemPrompt'):
            request_data['systemPrompt'] = params['systemPrompt']

        response = await self._async_post_request(
            f'{self.api_url}/v1/extract',
            request_data,
            headers
        )

        if response.get('success'):
            job_id = response.get('id')
            if not job_id:
                raise Exception('Job ID not returned from extract request.')

            while True:
                status_data = await self._async_get_request(
                    f'{self.api_url}/v1/extract/{job_id}',
                    headers
                )

                if status_data['status'] == 'completed':
                    return status_data
                elif status_data['status'] in ['failed', 'cancelled']:
                    raise Exception(f'Extract job {status_data["status"]}. Error: {status_data["error"]}')

                await asyncio.sleep(2)
        else:
            raise Exception(f'Failed to extract. Error: {response.get("error")}')

    async def check_batch_scrape_status(self, id: str) -> BatchScrapeStatusResponse:
        """
        Check the status of an asynchronous batch scrape job.

        Args:
            id (str): The ID of the batch scrape job

        Returns:
            BatchScrapeStatusResponse containing:
            Status Information:
            * status - Current state (scraping/completed/failed/cancelled)
            * completed - Number of URLs scraped
            * total - Total URLs to scrape
            * creditsUsed - API credits consumed
            * expiresAt - Data expiration timestamp
            
            Results:
            * data - List of scraped documents
            * next - URL for next page of results (if paginated)
            * success - Whether status check succeeded
            * error - Error message if failed

        Raises:
            Exception: If status check fails
        """
        headers = self._prepare_headers()
        endpoint = f'/v1/batch/scrape/{id}'

        status_data = await self._async_get_request(
            f'{self.api_url}{endpoint}',
            headers
        )

        if status_data['status'] == 'completed':
            if 'data' in status_data:
                data = status_data['data']
                while 'next' in status_data:
                    if len(status_data['data']) == 0:
                        break
                    next_url = status_data.get('next')
                    if not next_url:
                        logger.warning("Expected 'next' URL is missing.")
                        break
                    next_data = await self._async_get_request(next_url, headers)
                    data.extend(next_data.get('data', []))
                    status_data = next_data
                status_data['data'] = data

        response = {
            'status': status_data.get('status'),
            'total': status_data.get('total'),
            'completed': status_data.get('completed'),
            'creditsUsed': status_data.get('creditsUsed'),
            'expiresAt': status_data.get('expiresAt'),
            'data': status_data.get('data')
        }

        if 'error' in status_data:
            response['error'] = status_data['error']

        if 'next' in status_data:
            response['next'] = status_data['next']

        return {
            'success': False if 'error' in status_data else True,
            **response
        }

    async def check_batch_scrape_errors(self, id: str) -> CrawlErrorsResponse:
        """
        Get information about errors from an asynchronous batch scrape job.

        Args:
          id (str): The ID of the batch scrape job

        Returns:
          CrawlErrorsResponse containing:
            errors (List[Dict[str, str]]): List of errors with fields:
              * id (str): Error ID
              * timestamp (str): When the error occurred
              * url (str): URL that caused the error
              * error (str): Error message
          * robotsBlocked (List[str]): List of URLs blocked by robots.txt

        Raises:
          Exception: If error check fails
        """
        headers = self._prepare_headers()
        return await self._async_get_request(
            f'{self.api_url}/v1/batch/scrape/{id}/errors',
            headers
        )

    async def check_crawl_errors(self, id: str) -> CrawlErrorsResponse:
        """
        Get information about errors from an asynchronous crawl job.

        Args:
            id (str): The ID of the crawl job

        Returns:
            CrawlErrorsResponse containing:
            * errors (List[Dict[str, str]]): List of errors with fields:
                - id (str): Error ID
                - timestamp (str): When the error occurred
                - url (str): URL that caused the error
                - error (str): Error message
            * robotsBlocked (List[str]): List of URLs blocked by robots.txt

        Raises:
            Exception: If error check fails
        """
        headers = self._prepare_headers()
        return await self._async_get_request(
            f'{self.api_url}/v1/crawl/{id}/errors',
            headers
        )

    async def cancel_crawl(self, id: str) -> Dict[str, Any]:
        """
        Cancel an asynchronous crawl job.

        Args:
            id (str): The ID of the crawl job to cancel

        Returns:
            Dict[str, Any] containing:
            * success (bool): Whether cancellation was successful
            * error (str, optional): Error message if cancellation failed

        Raises:
            Exception: If cancellation fails
        """
        headers = self._prepare_headers()
        async with aiohttp.ClientSession() as session:
            async with session.delete(f'{self.api_url}/v1/crawl/{id}', headers=headers) as response:
                return await response.json()

    async def get_extract_status(self, job_id: str) -> ExtractResponse[Any]:
        """
        Check the status of an asynchronous extraction job.

        Args:
            job_id (str): The ID of the extraction job

        Returns:
            ExtractResponse containing:
            * success (bool): Whether extraction completed successfully
            * data (Any): Extracted structured data
            * error (str, optional): Error message if extraction failed
            * warning (str, optional): Warning message if any
            * sources (List[str], optional): Source URLs if requested

        Raises:
            ValueError: If status check fails
        """
        headers = self._prepare_headers()
        try:
            return await self._async_get_request(
                f'{self.api_url}/v1/extract/{job_id}',
                headers
            )
        except Exception as e:
            raise ValueError(str(e))

    async def async_extract(
            self,
            urls: List[str],
            params: Optional[ExtractParams] = None,
            idempotency_key: Optional[str] = None) -> ExtractResponse[Any]:
        """
        Initiate an asynchronous extraction job without waiting for completion.

        Args:
            urls (List[str]): URLs to extract information from
            params (Optional[ExtractParams]): See ExtractParams model:
              Extraction Config:
              * prompt - Custom extraction prompt
              * schema - JSON schema/Pydantic model
              * systemPrompt - System context
              
              Behavior Options:
              * allowExternalLinks - Follow external links
              * enableWebSearch - Enable web search
              * includeSubdomains - Include subdomains
              * showSources - Include source URLs
              
              Scraping Options:
              * scrapeOptions - Page scraping config
            idempotency_key (Optional[str]): Unique key to prevent duplicate requests

        Returns:
          ExtractResponse containing:
          * success (bool): Whether job started successfully
          * id (str): Unique identifier for the job
          * error (str, optional): Error message if start failed

        Raises:
          ValueError: If job initiation fails
        """
        headers = self._prepare_headers(idempotency_key)
        
        schema = params.get('schema') if params else None
        if schema:
            if hasattr(schema, 'model_json_schema'):
                schema = schema.model_json_schema()

        jsonData = {'urls': urls, **(params or {})}
        request_data = {
            **jsonData,
            'allowExternalLinks': params.get('allow_external_links', False) if params else False,
            'schema': schema,
            'origin': 'api-sdk'
        }

        try:
            return await self._async_post_request(
                f'{self.api_url}/v1/extract',
                request_data,
                headers
            )
        except Exception as e:
            raise ValueError(str(e))

    async def generate_llms_text(
            self,
            url: str,
            params: Optional[Union[Dict[str, Any], GenerateLLMsTextParams]] = None) -> GenerateLLMsTextStatusResponse:
        """
        Generate LLMs.txt for a given URL and monitor until completion.

        Args:
            url (str): Target URL to generate LLMs.txt from
            params (Optional[Union[Dict[str, Any], GenerateLLMsTextParams]]): See GenerateLLMsTextParams model:
              Generation Options:
              * maxUrls - Maximum URLs to process (default: 10)
              * showFullText - Include full text in output (default: False)

        Returns:
            GenerateLLMsTextStatusResponse containing:
            * success (bool): Whether generation completed successfully
            * status (str): Status of generation (processing/completed/failed)
            * data (Dict[str, str], optional): Generated text with fields:
                - llmstxt (str): Generated LLMs.txt content
                - llmsfulltxt (str, optional): Full version if requested
            * error (str, optional): Error message if generation failed
            * expiresAt (str): When the generated data expires

        Raises:
            Exception: If generation fails
        """
        if params is None:
            params = {}

        if isinstance(params, dict):
            generation_params = GenerateLLMsTextParams(**params)
        else:
            generation_params = params

        response = await self.async_generate_llms_text(url, generation_params)
        if not response.get('success') or 'id' not in response:
            return response

        job_id = response['id']
        while True:
            status = await self.check_generate_llms_text_status(job_id)
            
            if status['status'] == 'completed':
                return status
            elif status['status'] == 'failed':
                raise Exception(f'LLMs.txt generation failed. Error: {status.get("error")}')
            elif status['status'] != 'processing':
                break

            await asyncio.sleep(2)

        return {'success': False, 'error': 'LLMs.txt generation job terminated unexpectedly'}

    async def async_generate_llms_text(
            self,
            url: str,
            params: Optional[Union[Dict[str, Any], GenerateLLMsTextParams]] = None) -> GenerateLLMsTextResponse:
        """
        Initiate an asynchronous LLMs.txt generation job without waiting for completion.

        Args:
          url (str): Target URL to generate LLMs.txt from
          params (Optional[Union[Dict[str, Any], GenerateLLMsTextParams]]): See GenerateLLMsTextParams model:
            Generation Options:
            * maxUrls - Maximum URLs to process (default: 10)
            * showFullText - Include full text in output (default: False)

        Returns:
          GenerateLLMsTextResponse containing:
          * success (bool): Whether job started successfully
          * id (str): Unique identifier for the job
          * error (str, optional): Error message if start failed

        Raises:
          ValueError: If job initiation fails
        """
        if params is None:
            params = {}

        if isinstance(params, dict):
            generation_params = GenerateLLMsTextParams(**params)
        else:
            generation_params = params

        headers = self._prepare_headers()
        json_data = {'url': url, **generation_params.dict(exclude_none=True)}

        try:
            return await self._async_post_request(
                f'{self.api_url}/v1/llmstxt',
                json_data,
                headers
            )
        except Exception as e:
            raise ValueError(str(e))

    async def check_generate_llms_text_status(self, id: str) -> GenerateLLMsTextStatusResponse:
        """
        Check the status of an asynchronous LLMs.txt generation job.

        Args:
            id (str): The ID of the generation job

        Returns:
            GenerateLLMsTextStatusResponse containing:
            * success (bool): Whether generation completed successfully
            * status (str): Status of generation (processing/completed/failed)
            * data (Dict[str, str], optional): Generated text with fields:
                - llmstxt (str): Generated LLMs.txt content
                - llmsfulltxt (str, optional): Full version if requested
            * error (str, optional): Error message if generation failed
            * expiresAt (str): When the generated data expires

        Raises:
            ValueError: If status check fails
        """
        headers = self._prepare_headers()
        try:
            return await self._async_get_request(
                f'{self.api_url}/v1/llmstxt/{id}',
                headers
            )
        except Exception as e:
            raise ValueError(str(e))

    async def deep_research(
            self,
            query: str,
            params: Optional[Union[Dict[str, Any], DeepResearchParams]] = None, 
            on_activity: Optional[Callable[[Dict[str, Any]], None]] = None,
            on_source: Optional[Callable[[Dict[str, Any]], None]] = None) -> DeepResearchStatusResponse:
        """
        Initiates a deep research operation on a given query and polls until completion, providing real-time updates via callbacks.

        Args:
          query: Research query or topic to investigate

          params: See DeepResearchParams model:
            Research Settings:
              * maxDepth - Maximum research depth (default: 7)
              * timeLimit - Time limit in seconds (default: 270)
              * maxUrls - Maximum URLs to process (default: 20)

          Callbacks:
          * on_activity - Progress callback receiving:
              {type, status, message, timestamp, depth}
          * on_source - Source discovery callback receiving:
              {url, title, description}

        Returns:
          DeepResearchResponse containing:

          Status:
          * success - Whether research completed successfully
          * status - Current state (processing/completed/failed)
          * error - Error message if failed
          
          Results:
          * id - Unique identifier for the research job
          * data - Research findings and analysis
          * sources - List of discovered sources
          * activities - Research progress log
          * summaries - Generated research summaries

        Raises:
          Exception: If research fails
        """
        if params is None:
            params = {}

        if isinstance(params, dict):
            research_params = DeepResearchParams(**params)
        else:
            research_params = params

        response = await self.async_deep_research(query, research_params)
        if not response.get('success') or 'id' not in response:
            return response

        job_id = response['id']
        last_activity_count = 0
        last_source_count = 0

        while True:
            status = await self.check_deep_research_status(job_id)
            
            if on_activity and 'activities' in status:
                new_activities = status['activities'][last_activity_count:]
                for activity in new_activities:
                    on_activity(activity)
                last_activity_count = len(status['activities'])
            
            if on_source and 'sources' in status:
                new_sources = status['sources'][last_source_count:]
                for source in new_sources:
                    on_source(source)
                last_source_count = len(status['sources'])
            
            if status['status'] == 'completed':
                return status
            elif status['status'] == 'failed':
                raise Exception(f'Deep research failed. Error: {status.get("error")}')
            elif status['status'] != 'processing':
                break

            await asyncio.sleep(2)

        return {'success': False, 'error': 'Deep research job terminated unexpectedly'}

    async def async_deep_research(
            self,
            query: str,
            params: Optional[Union[Dict[str, Any], DeepResearchParams]] = None) -> DeepResearchResponse:
        """
        Initiate an asynchronous deep research job without waiting for completion.

        Args:
            query (str): Research query or topic to investigate
            params (Optional[Union[Dict[str, Any], DeepResearchParams]]): See DeepResearchParams model:
              Research Settings:
              * maxDepth - Maximum research depth (default: 7)
              * timeLimit - Time limit in seconds (default: 270)
              * maxUrls - Maximum URLs to process (default: 20)

        Returns:
          DeepResearchResponse containing:
          * success (bool): Whether job started successfully
          * id (str): Unique identifier for the job
          * error (str, optional): Error message if start failed

        Raises:
          ValueError: If job initiation fails
        """
        if params is None:
            params = {}

        if isinstance(params, dict):
            research_params = DeepResearchParams(**params)
        else:
            research_params = params

        headers = self._prepare_headers()
        json_data = {'query': query, **research_params.dict(exclude_none=True)}

        try:
            return await self._async_post_request(
                f'{self.api_url}/v1/deep-research',
                json_data,
                headers
            )
        except Exception as e:
            raise ValueError(str(e))

    async def check_deep_research_status(self, id: str) -> DeepResearchStatusResponse:
        """
        Check the status of an asynchronous deep research job.

        Args:
            id (str): The ID of the research job

        Returns:
            DeepResearchStatusResponse containing:
            * success (bool): Whether research completed successfully
            * status (str): Current state (processing/completed/failed)
            * data (Dict[str, Any], optional): Research findings and analysis
            * error (str, optional): Error message if failed
            * expiresAt (str): When the research data expires
            * currentDepth (int): Current research depth
            * maxDepth (int): Maximum research depth
            * activities (List[Dict[str, Any]]): Research progress log
            * sources (List[Dict[str, Any]]): Discovered sources
            * summaries (List[str]): Generated research summaries

        Raises:
            ValueError: If status check fails
        """
        headers = self._prepare_headers()
        try:
            return await self._async_get_request(
                f'{self.api_url}/v1/deep-research/{id}',
                headers
            )
        except Exception as e:
            raise ValueError(str(e))

    async def search(
            self,
            query: str,
            params: Optional[Union[Dict[str, Any], SearchParams]] = None) -> SearchResponse:
        """
        Asynchronously search for content using Firecrawl.

        Args:
          query (str): Search query string
          params (Optional[Union[Dict[str, Any], SearchParams]]): See SearchParams model:
            Search Options:
            * limit - Max results (default: 5)
            * tbs - Time filter (e.g. "qdr:d")
            * filter - Custom result filter
            
            Localization:
            * lang - Language code (default: "en")
            * country - Country code (default: "us")
            * location - Geo-targeting
            
            Request Options:
            * timeout - Request timeout (ms)
            * scrapeOptions - Result scraping config

        Returns:
          SearchResponse containing:
          * success (bool): Whether search completed successfully
          * data (List[FirecrawlDocument]): Search results
          * warning (str, optional): Warning message if any
          * error (str, optional): Error message if search failed

        Raises:
          Exception: If search fails
        """
        if params is None:
            params = {}

        if isinstance(params, dict):
            search_params = SearchParams(query=query, **params)
        else:
            search_params = params
            search_params.query = query

        return await self._async_post_request(
            f"{self.api_url}/v1/search",
            search_params.dict(exclude_none=True),
            {"Authorization": f"Bearer {self.api_key}"}
        )

class AsyncCrawlWatcher(CrawlWatcher):
    """
    Async version of CrawlWatcher that properly handles async operations.
    """
    def __init__(self, id: str, app: AsyncFirecrawlApp):
        super().__init__(id, app)

    async def connect(self) -> None:
        """
        Establishes async WebSocket connection and starts listening for messages.
        """
        async with websockets.connect(self.ws_url, extra_headers={"Authorization": f"Bearer {self.app.api_key}"}) as websocket:
            await self._listen(websocket)

    async def _listen(self, websocket) -> None:
        """
        Listens for incoming WebSocket messages and handles them asynchronously.

        Args:
            websocket: The WebSocket connection object
        """
        async for message in websocket:
            msg = json.loads(message)
            await self._handle_message(msg)

    async def _handle_message(self, msg: Dict[str, Any]) -> None:
        """
        Handles incoming WebSocket messages based on their type asynchronously.

        Args:
            msg (Dict[str, Any]): The message to handle
        """
        if msg['type'] == 'done':
            self.status = 'completed'
            self.dispatch_event('done', {'status': self.status, 'data': self.data, 'id': self.id})
        elif msg['type'] == 'error':
            self.status = 'failed'
            self.dispatch_event('error', {'status': self.status, 'data': self.data, 'error': msg['error'], 'id': self.id})
        elif msg['type'] == 'catchup':
            self.status = msg['data']['status']
            self.data.extend(msg['data'].get('data', []))
            for doc in self.data:
                self.dispatch_event('document', {'data': doc, 'id': self.id})
        elif msg['type'] == 'document':
            self.data.append(msg['data'])
            self.dispatch_event('document', {'data': msg['data'], 'id': self.id})

    async def _handle_error(self, response: aiohttp.ClientResponse, action: str) -> None:
        """
        Handle errors from async API responses.
        """
        try:
            error_data = await response.json()
            error_message = error_data.get('error', 'No error message provided.')
            error_details = error_data.get('details', 'No additional error details provided.')
        except:
            raise aiohttp.ClientError(f'Failed to parse Firecrawl error response as JSON. Status code: {response.status}')

        # Use the app's method to get the error message
        message = await self.app._get_async_error_message(response.status, action, error_message, error_details)

        raise aiohttp.ClientError(message)

    async def _get_async_error_message(self, status_code: int, action: str, error_message: str, error_details: str) -> str:
        """
        Generate a standardized error message based on HTTP status code for async operations.
        
        Args:
            status_code (int): The HTTP status code from the response
            action (str): Description of the action that was being performed
            error_message (str): The error message from the API response
            error_details (str): Additional error details from the API response
            
        Returns:
            str: A formatted error message
        """
        return self._get_error_message(status_code, action, error_message, error_details)
