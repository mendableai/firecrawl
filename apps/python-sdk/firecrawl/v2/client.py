"""
Main Firecrawl v2 API client.

This module provides the main client class that orchestrates all v2 functionality.
"""

import os
from typing import Optional, List, Dict, Any, Callable, Union
from .types import (
    ClientConfig, ScrapeOptions, CrawlOptions, MapOptions, ExtractOptions,
    ScrapeResponse, CrawlResponse, CrawlStatusResponse, BatchScrapeResponse,
    BatchScrapeStatusResponse, MapResponse, ExtractResponse, Document,
    SearchRequest, SearchResponse, CrawlRequest, WebhookConfig, CrawlErrorsResponse, ActiveCrawlsResponse,
    FormatOption, WaitAction, ScreenshotAction, ClickAction, WriteAction, PressAction, ScrollAction, ScrapeAction, ExecuteJavascriptAction, PDFAction, Location,
)
from .utils.http_client import HttpClient
from .utils.error_handler import FirecrawlError
from .methods import scrape as scrape_module
from .methods import crawl as crawl_module  
from .methods import batch as batch_module
from .methods import search as search_module

class FirecrawlClient:
    """
    Main Firecrawl v2 API client.
    
    This client provides a clean, modular interface to all Firecrawl functionality.
    """
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        api_url: str = "https://api.firecrawl.dev",
        timeout: Optional[float] = None,
        max_retries: int = 3,
        backoff_factor: float = 0.5
    ):
        """
        Initialize the Firecrawl client.
        
        Args:
            api_key: Firecrawl API key (or set FIRECRAWL_API_KEY env var)
            api_url: Base URL for the Firecrawl API
            timeout: Request timeout in seconds
            max_retries: Maximum number of retries for failed requests
            backoff_factor: Exponential backoff factor for retries (e.g. 0.5 means wait 0.5s, then 1s, then 2s between retries)
        """
        if api_key is None:
            api_key = os.getenv("FIRECRAWL_API_KEY")
        
        if not api_key:
            raise ValueError(
                "API key is required. Set FIRECRAWL_API_KEY environment variable "
                "or pass api_key parameter."
            )
        
        self.config = ClientConfig(
            api_key=api_key,
            api_url=api_url,
            timeout=timeout,
            max_retries=max_retries,
            backoff_factor=backoff_factor
        )
        
        self.http_client = HttpClient(api_key, api_url)
    
    def scrape(
        self,
        url: str,
        *,
        formats: Optional[List['FormatOption']] = None,
        headers: Optional[Dict[str, str]] = None,
        include_tags: Optional[List[str]] = None,
        exclude_tags: Optional[List[str]] = None,
        only_main_content: Optional[bool] = None,
        timeout: Optional[int] = None,
        wait_for: Optional[int] = None,
        mobile: Optional[bool] = None,
        parsers: Optional[List[str]] = None,
        actions: Optional[List[Union['WaitAction', 'ScreenshotAction', 'ClickAction', 'WriteAction', 'PressAction', 'ScrollAction', 'ScrapeAction', 'ExecuteJavascriptAction', 'PDFAction']]] = None,
        location: Optional['Location'] = None,
        skip_tls_verification: Optional[bool] = None,
        remove_base64_images: Optional[bool] = None,
        fast_mode: Optional[bool] = None,
        use_mock: Optional[str] = None,
        block_ads: Optional[bool] = None,
        proxy: Optional[str] = None,
        max_age: Optional[int] = None,
        store_in_cache: Optional[bool] = None,
    ) -> Document:
        """
        Scrape a single URL and return the document.
        Args:
            url: URL to scrape
            formats: List of formats to scrape
            headers: Dictionary of headers to use
            include_tags: List of tags to include
            exclude_tags: List of tags to exclude
            only_main_content: Whether to only scrape the main content
            timeout: Timeout in seconds
            wait_for: Wait for a specific element to be present
            mobile: Whether to use mobile mode
            parsers: List of parsers to use
            actions: List of actions to perform
            location: Location to scrape
            skip_tls_verification: Whether to skip TLS verification
            remove_base64_images: Whether to remove base64 images
            fast_mode: Whether to use fast mode
            use_mock: Whether to use mock mode
            block_ads: Whether to block ads
            proxy: Proxy to use
            max_age: Maximum age of the cache
            store_in_cache: Whether to store the result in the cache
        Returns:
            Document
        """
        options = ScrapeOptions(
            **{k: v for k, v in dict(
                formats=formats,
                headers=headers,
                include_tags=include_tags,
                exclude_tags=exclude_tags,
                only_main_content=only_main_content,
                timeout=timeout,
                wait_for=wait_for,
                mobile=mobile,
                parsers=parsers,
                actions=actions,
                location=location,
                skip_tls_verification=skip_tls_verification,
                remove_base64_images=remove_base64_images,
                fast_mode=fast_mode,
                use_mock=use_mock,
                block_ads=block_ads,
                proxy=proxy,
                max_age=max_age,
                store_in_cache=store_in_cache,
            ).items() if v is not None}
        ) if any(v is not None for v in [formats, headers, include_tags, exclude_tags, only_main_content, timeout, wait_for, mobile, parsers, actions, location, skip_tls_verification, remove_base64_images, fast_mode, use_mock, block_ads, proxy, max_age, store_in_cache]) else None
        return scrape_module.scrape(self.http_client, url, options)

    def search(
        self,
        query: str,
        *,
        limit: Optional[int] = None,
        tbs: Optional[str] = None,
        location: Optional[str] = None,
        timeout: Optional[int] = None,
        page_options: Optional[ScrapeOptions] = None,
    ) -> SearchResponse:
        """
        Search for documents.
        
        Args:
            query: Search query string
            limit: Maximum number of results to return (default: 5)
            tbs: Time-based search filter
            location: Location string for search
            timeout: Request timeout in milliseconds (default: 60000)
            page_options: Options for scraping individual pages
            
        Returns:
            SearchResponse containing the search results
        """
        options = SearchRequest(
            limit=limit,
            tbs=tbs,
            location=location,
            timeout=timeout,
            page_options=page_options
        )
        
        return search_module.search(self.http_client, query, options)
    
    def crawl(
        self,
        url: str,
        *,
        prompt: Optional[str] = None,
        exclude_paths: Optional[List[str]] = None,
        include_paths: Optional[List[str]] = None,
        max_discovery_depth: Optional[int] = None,
        ignore_sitemap: bool = False,
        ignore_query_parameters: bool = False,
        limit: Optional[int] = None,
        crawl_entire_domain: bool = False,
        allow_external_links: bool = False,
        allow_subdomains: bool = False,
        delay: Optional[int] = None,
        max_concurrency: Optional[int] = None,
        webhook: Optional[Union[str, WebhookConfig]] = None,
        scrape_options: Optional[ScrapeOptions] = None,
        zero_data_retention: bool = False,
        poll_interval: int = 2,
        timeout: Optional[int] = None
    ) -> CrawlStatusResponse:
        """
        Start a crawl job and wait for it to complete.
        
        Args:
            url: Target URL to start crawling from
            prompt: Optional prompt to guide the crawl
            exclude_paths: Patterns of URLs to exclude
            include_paths: Patterns of URLs to include
            max_discovery_depth: Maximum depth for finding new URLs
            ignore_sitemap: Skip sitemap.xml processing
            ignore_query_parameters: Ignore URL parameters
            limit: Maximum pages to crawl
            crawl_entire_domain: Follow parent directory links
            allow_external_links: Follow external domain links
            allow_subdomains: Follow subdomains
            delay: Delay in seconds between scrapes
            max_concurrency: Maximum number of concurrent scrapes
            webhook: Webhook configuration for notifications
            scrape_options: Page scraping configuration
            zero_data_retention: Whether to delete data after 24 hours
            poll_interval: Seconds between status checks
            timeout: Maximum seconds to wait (None for no timeout)
            
        Returns:
            CrawlStatusResponse when job completes
            
        Raises:
            ValueError: If request is invalid
            Exception: If the crawl fails to start or complete
            TimeoutError: If timeout is reached
        """
        request = CrawlRequest(
            url=url,
            prompt=prompt,
            exclude_paths=exclude_paths,
            include_paths=include_paths,
            max_discovery_depth=max_discovery_depth,
            ignore_sitemap=ignore_sitemap,
            ignore_query_parameters=ignore_query_parameters,
            limit=limit,
            crawl_entire_domain=crawl_entire_domain,
            allow_external_links=allow_external_links,
            allow_subdomains=allow_subdomains,
            delay=delay,
            max_concurrency=max_concurrency,
            webhook=webhook,
            scrape_options=scrape_options,
            zero_data_retention=zero_data_retention
        )
        
        return crawl_module.crawl(
            self.http_client, 
            request, 
            poll_interval=poll_interval, 
            timeout=timeout
        )
    
    def start_crawl(
        self,
        url: str,
        *,
        prompt: Optional[str] = None,
        exclude_paths: Optional[List[str]] = None,
        include_paths: Optional[List[str]] = None,
        max_discovery_depth: Optional[int] = None,
        ignore_sitemap: bool = False,
        ignore_query_parameters: bool = False,
        limit: Optional[int] = None,
        crawl_entire_domain: bool = False,
        allow_external_links: bool = False,
        allow_subdomains: bool = False,
        delay: Optional[int] = None,
        max_concurrency: Optional[int] = None,
        webhook: Optional[Union[str, WebhookConfig]] = None,
        scrape_options: Optional[ScrapeOptions] = None,
        zero_data_retention: bool = False
    ) -> CrawlResponse:
        """
        Start an asynchronous crawl job.
        
        Args:
            url: Target URL to start crawling from
            prompt: Optional prompt to guide the crawl
            exclude_paths: Patterns of URLs to exclude
            include_paths: Patterns of URLs to include
            max_discovery_depth: Maximum depth for finding new URLs
            ignore_sitemap: Skip sitemap.xml processing
            ignore_query_parameters: Ignore URL parameters
            limit: Maximum pages to crawl
            crawl_entire_domain: Follow parent directory links
            allow_external_links: Follow external domain links
            allow_subdomains: Follow subdomains
            delay: Delay in seconds between scrapes
            max_concurrency: Maximum number of concurrent scrapes
            webhook: Webhook configuration for notifications
            scrape_options: Page scraping configuration
            zero_data_retention: Whether to delete data after 24 hours
            
        Returns:
            CrawlResponse with job information
            
        Raises:
            ValueError: If request is invalid
            Exception: If the crawl operation fails to start
        """
        request = CrawlRequest(
            url=url,
            prompt=prompt,
            exclude_paths=exclude_paths,
            include_paths=include_paths,
            max_discovery_depth=max_discovery_depth,
            ignore_sitemap=ignore_sitemap,
            ignore_query_parameters=ignore_query_parameters,
            limit=limit,
            crawl_entire_domain=crawl_entire_domain,
            allow_external_links=allow_external_links,
            allow_subdomains=allow_subdomains,
            delay=delay,
            max_concurrency=max_concurrency,
            webhook=webhook,
            scrape_options=scrape_options,
            zero_data_retention=zero_data_retention
        )
        
        return crawl_module.start_crawl(self.http_client, request)
    
    def get_crawl_status(self, job_id: str) -> CrawlStatusResponse:
        """
        Get the status of a crawl job.
        
        Args:
            job_id: ID of the crawl job
            
        Returns:
            CrawlStatusResponse with current status and data
            
        Raises:
            Exception: If the status check fails
        """
        return crawl_module.get_crawl_status(self.http_client, job_id)
    
    def check_crawl_errors(self, crawl_id: str) -> CrawlErrorsResponse:
        """
        Get errors from a crawl job.
        
        Args:
            crawl_id: The ID of the crawl job
            
        Returns:
            CrawlErrorsResponse containing errors and robots blocked URLs
        """
        return crawl_module.check_crawl_errors(self.http_client, crawl_id)
    
    def get_active_crawls(self) -> ActiveCrawlsResponse:
        """
        Get a list of currently active crawl jobs.
        
        Returns:
            ActiveCrawlsResponse containing a list of active crawl jobs.
        """
        return crawl_module.get_active_crawls(self.http_client)
    
    def cancel_crawl(self, crawl_id: str) -> bool:
        """
        Cancel a crawl job.
        
        Args:
            crawl_id: The ID of the crawl job to cancel
            
        Returns:
            bool: True if the crawl was cancelled, False otherwise
        """
        return crawl_module.cancel_crawl(self.http_client, crawl_id)
    