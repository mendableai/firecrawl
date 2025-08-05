from typing import Optional, List, Union
from ..types import SearchResponse, ScrapeOptions, SearchRequest, SourceOption, FormatOption
from .methods.search import search as search_method
from .utils.http_client import HttpClient

class FirecrawlClient:
    """

    """
    
    def __init__(self, api_key: str = None, api_url: str = "https://api.firecrawl.dev"):
        self.api_key = api_key or "placeholder-key"
        self.api_url = api_url
        self._client = HttpClient(api_key=self.api_key, api_url=self.api_url)

    # scrape
    def scrape(
          self
    ):
        pass

    # batch-scrape
    def batch_scrape(
          self
    ):
        pass

    # async-batch-scrape
    def async_batch_scrape(
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
    
    # crawl
    def crawl(
          self
    ):
        pass
    
    # async-crawl
    def async_crawl(
          self
    ):
        pass


    # crawl-params
    def crawl_params(
          self
    ):
        pass

    # get-crawl-status
    def get_crawl_status(
          self
    ):
        pass 

    # cancel-crawl
    def cancel_crawl(
          self
    ):
        pass

    # get-active-crawls
    def get_active_crawls(
          self
    ):
        pass
    # get-crawl-errors
    def get_crawl_errors(
          self
    ):
        pass

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
    ) -> SearchResponse:
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