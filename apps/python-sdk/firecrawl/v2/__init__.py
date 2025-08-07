from typing import Optional, List, Union, Dict, Any
from ..types import (
    SearchData, Document, ScrapeOptions, SearchRequest, 
    SourceOption, FormatOption, CrawlRequest, CrawlJob, CrawlResponse,
    CrawlParamsRequest, CrawlParamsData, CrawlErrorsResponse, ActiveCrawlsResponse,
    WaitAction, ScreenshotAction, ClickAction, WriteAction, PressAction, ScrollAction, ScrapeAction, ExecuteJavascriptAction, PDFAction, Location
)
from .methods.search import search as search_method
from .methods.crawl import (
    crawl as crawl_method, 
    start_crawl as start_crawl_method, 
    cancel_crawl as cancel_crawl_method, 
    get_crawl_status as get_crawl_status_method,
    crawl_params_preview as crawl_params_preview_method,
    get_crawl_errors as get_crawl_errors_method,
    get_active_crawls as get_active_crawls_method
)
from .methods.scrape import scrape as scrape_method
from .utils.http_client import HttpClient

class FirecrawlClient:
    """
    Firecrawl v2 API client.
    """
    
    def __init__(self, api_key: str = None, api_url: str = "https://api.firecrawl.dev"):
        self.api_key = api_key
        self.api_url = api_url
        self._client = HttpClient(api_key=self.api_key, api_url=self.api_url)

    def scrape(
        self,
        url: str,
        formats: Optional[List[FormatOption]] = None,
        headers: Optional[Dict[str, str]] = None,
        include_tags: Optional[List[str]] = None,
        exclude_tags: Optional[List[str]] = None,
        only_main_content: Optional[bool] = None,
        timeout: Optional[int] = None,
        wait_for: Optional[int] = None,
        mobile: Optional[bool] = None,
        parsers: Optional[List[str]] = None,
        actions: Optional[List[Union[WaitAction, ScreenshotAction, ClickAction, WriteAction, PressAction, ScrollAction, ScrapeAction, ExecuteJavascriptAction, PDFAction]]] = None,
        location: Optional[Location] = None,
        skip_tls_verification: Optional[bool] = None,
        remove_base64_images: Optional[bool] = None,
        fast_mode: Optional[bool] = None,
        use_mock: Optional[str] = None,
        block_ads: Optional[bool] = None,
        proxy: Optional[str] = None,
        max_age: Optional[int] = None,
        store_in_cache: Optional[bool] = None,
    ) -> Document:
        """Scrape a single URL and return the document."""
        options = ScrapeOptions(
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
            store_in_cache=store_in_cache
        )
        return scrape_method(self._client, url, options)

    # batch-scrape
    def batch_scrape(
          self
    ):
        pass

    # start-batch-scrape
    def start_batch_scrape(
          self
    ):
        pass

    # get-batch-scrape-status
    def get_batch_scrape_status(
          self
    ):
        pass

    # cancel-batch-scrape
    def cancel_batch_scrape(
          self
    ):
        pass
    # get-batch-scrape-errors
    def get_batch_scrape_errors(
          self
    ):
        pass
    
    def crawl(
        self,
        url: str,
        prompt: Optional[str] = None,
        include_paths: Optional[List[str]] = None,
        exclude_paths: Optional[List[str]] = None,
        max_discovery_depth: Optional[int] = None,
        ignore_sitemap: bool = False,
        ignore_query_parameters: bool = False,
        limit: Optional[int] = None,
        crawl_entire_domain: bool = False,
        allow_external_links: bool = False,
        allow_subdomains: bool = False,
        delay: Optional[int] = None,
        max_concurrency: Optional[int] = None,
        webhook: Optional[Dict[str, Any]] = None,
        scrape_options: Optional[ScrapeOptions] = None,
        zero_data_retention: bool = False,
        poll_interval: int = 2,
        timeout: Optional[int] = None
    ) -> CrawlJob:
        """Start a crawl job and wait for it to complete."""
        request = CrawlRequest(
            url=url, 
            prompt=prompt,
            include_paths=include_paths,
            exclude_paths=exclude_paths,
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
        return crawl_method(self._client, request, poll_interval, timeout)
    
    def start_crawl(
        self,
        url: str,
        prompt: Optional[str] = None,
        include_paths: Optional[List[str]] = None,
        exclude_paths: Optional[List[str]] = None,
        max_discovery_depth: Optional[int] = None,
        ignore_sitemap: bool = False,
        ignore_query_parameters: bool = False,
        limit: Optional[int] = None,
        crawl_entire_domain: bool = False,
        allow_external_links: bool = False,
        allow_subdomains: bool = False,
        delay: Optional[int] = None,
        max_concurrency: Optional[int] = None,
        webhook: Optional[Dict[str, Any]] = None,
        scrape_options: Optional[ScrapeOptions] = None,
        zero_data_retention: bool = False
    ) -> CrawlResponse:
        """Start a crawl job and return immediately."""
        request = CrawlRequest(
            url=url, 
            prompt=prompt,
            include_paths=include_paths,
            exclude_paths=exclude_paths,
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
        return start_crawl_method(self._client, request)

    def get_crawl_status(
        self,
        job_id: str
    ) -> CrawlJob:
        """Get the status of a crawl job."""
        return get_crawl_status_method(self._client, job_id)

    def cancel_crawl(
        self,
        job_id: str
    ) -> bool:
        """Cancel a running crawl job."""
        return cancel_crawl_method(self._client, job_id)

    def crawl_params_preview(
        self,
        url: str,
        prompt: str
    ) -> CrawlParamsData:
        """Get crawl parameters from LLM based on URL and prompt."""
        request = CrawlParamsRequest(url=url, prompt=prompt)
        return crawl_params_preview_method(self._client, request)

    def active_crawls(
          self
    ) -> ActiveCrawlsResponse:
        """Get a list of active crawl jobs."""
        return get_active_crawls_method(self._client)
    
    def get_crawl_errors(
        self,
        crawl_id: str
    ) -> CrawlErrorsResponse:
        """Get errors from a crawl job."""
        return get_crawl_errors_method(self._client, crawl_id)

    # map
    def map(
          self
    ):
        pass

    def search(
        self,
        query: str,
        sources: Optional[List[SourceOption]] = None,
        limit: Optional[int] = 5,
        tbs: Optional[str] = None,
        location: Optional[str] = None,
        ignore_invalid_urls: Optional[bool] = True,
        timeout: Optional[int] = 60000,
        scrape_options: Optional[ScrapeOptions] = None,
    ) -> SearchData:
        """Search for documents."""
        request = SearchRequest(
            query=query,
            sources=sources,
            limit=limit,
            tbs=tbs,
            location=location,
            ignore_invalid_urls=ignore_invalid_urls,
            timeout=timeout,
            scrape_options=scrape_options,
        )
        return search_method(self._client, request)

    # credit-usage
    def credit_usage(
        self
    ):
        pass

__all__ = ['FirecrawlClient']