"""
Main Firecrawl v2 API client.

This module provides the main client class that orchestrates all v2 functionality.
"""

import os
from typing import Optional, List, Dict, Any, Callable
from .types import (
    ClientConfig, ScrapeOptions, CrawlOptions, MapOptions, ExtractOptions,
    ScrapeResponse, CrawlResponse, CrawlStatusResponse, BatchScrapeResponse,
    BatchScrapeStatusResponse, MapResponse, ExtractResponse, Document,
    SearchRequest, SearchResponse
)
from .utils.http_client import HttpClient
from .utils.error_handler import FirecrawlError
# Import functions from modules
from . import scrape as scrape_module
from . import crawl as crawl_module  
from . import batch as batch_module
from . import search as search_module


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
    
    # def scrape(
    #     self,
    #     url: str,
    #     options: Optional[ScrapeOptions] = None
    # ) -> ScrapeResponse:
    #     """
    #     Scrape a single URL.
        
    #     Args:
    #         url: URL to scrape
    #         options: Scraping options
            
    #     Returns:
    #         ScrapeResponse containing the scraped document
    #     """
    
    #     return scrape_module.scrape(self.http_client, url, options)


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
        # Build options object from individual parameters
        options = SearchRequest(
            limit=limit,
            tbs=tbs,
            location=location,
            timeout=timeout,
            page_options=page_options
        )
        
        return search_module.search(self.http_client, query, options)
    