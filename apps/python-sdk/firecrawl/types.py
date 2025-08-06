"""
Unified Firecrawl Types

This module provides unified access to Firecrawl types across all API versions.
Currently exports v2 types as the primary interface.
"""

from .v2.types import (
    # Base types
    BaseResponse,
    
    # Document types
    Document,
    DocumentMetadata,
    
    # Scrape types
    ScrapeFormats,
    ScrapeOptions,
    ScrapeRequest,
    ScrapeData,
    ScrapeResponse,
    
    # Crawl types
    CrawlRequest,
    CrawlJob,
    CrawlJobData,
    CrawlData,
    CrawlResponse,
    CrawlParamsRequest,
    CrawlParamsData,
    CrawlParamsResponse,
    
    # Batch scrape types
    BatchScrapeRequest,
    BatchScrapeJob,
    BatchScrapeData,
    BatchScrapeResponse,
    
    # Map types
    MapOptions,
    MapRequest,
    MapData,
    MapResponse,
    
    # Search types
    Source,
    SourceOption,
    Format,
    FormatOption,
    SearchRequest,
    SearchResult,
    SearchData,
    SearchResponse,
    
    # Action types
    WaitAction,
    ScreenshotAction,
    ClickAction,
    WriteAction,
    PressAction,
    ScrollAction,
    ScrapeAction,
    ExecuteJavascriptAction,
    PDFAction,
    
    # Location and format types
    Location,
    JsonFormat,
    
    # Error types
    ErrorDetails,
    ErrorResponse,
    
    # Job management types
    JobStatus,
    
    # Webhook types
    WebhookData,
    
    # Configuration types
    ClientConfig,
    
    # Union types
    ScrapeResult,
    CrawlResult,
    BatchResult,
    JobResult,
    StatusResult,
    AnyResponse,
)

__all__ = [
    # Base types
    'BaseResponse',
    
    # Document types
    'Document',
    'DocumentMetadata',
    
    # Scrape types
    'ScrapeFormats',
    'ScrapeOptions',
    'ScrapeRequest',
    'ScrapeData',
    'ScrapeResponse',
    
    # Crawl types
    'CrawlRequest',
    'CrawlJob',
    'CrawlJobData',
    'CrawlData',
    'CrawlResponse',
    'CrawlParamsRequest',
    'CrawlParamsData',
    'CrawlParamsResponse',
    
    # Batch scrape types
    'BatchScrapeRequest',
    'BatchScrapeJob',
    'BatchScrapeData',
    'BatchScrapeResponse',
    
    # Map types
    'MapOptions',
    'MapRequest',
    'MapData',
    'MapResponse',
    
    # Search types
    'Source',
    'SourceOption',
    'Format',
    'FormatOption',
    'SearchRequest',
    'SearchResult',
    'SearchData',
    'SearchResponse',
    
    # Action types
    'WaitAction',
    'ScreenshotAction',
    'ClickAction',
    'WriteAction',
    'PressAction',
    'ScrollAction',
    'ScrapeAction',
    'ExecuteJavascriptAction',
    'PDFAction',
    
    # Location and format types
    'Location',
    'JsonFormat',
    
    # Error types
    'ErrorDetails',
    'ErrorResponse',
    
    # Job management types
    'JobStatus',
    
    # Webhook types
    'WebhookData',
    
    # Configuration types
    'ClientConfig',
    
    # Union types
    'ScrapeResult',
    'CrawlResult',
    'BatchResult',
    'JobResult',
    'StatusResult',
    'AnyResponse',
] 