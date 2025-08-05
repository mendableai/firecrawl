"""
Type definitions for Firecrawl v2 API.

This module contains clean, modern type definitions for the v2 API.
"""

from typing import Dict, List, Optional, Union, Literal, Any, TypeVar, Generic
from pydantic import BaseModel, Field, field_validator
from datetime import datetime

T = TypeVar('T')

# Base response types
class BaseResponse(BaseModel, Generic[T]):
    """Base response structure for all API responses."""
    success: bool
    data: Optional[T] = None
    error: Optional[str] = None
    warning: Optional[str] = None

# Document and content types
class DocumentMetadata(BaseModel):
    """Metadata for scraped documents."""
    title: Optional[str] = None
    description: Optional[str] = None
    language: Optional[str] = None
    keywords: Optional[str] = None
    robots: Optional[str] = None
    og_title: Optional[str] = Field(None, alias="ogTitle")
    og_description: Optional[str] = Field(None, alias="ogDescription")
    og_url: Optional[str] = Field(None, alias="ogUrl")
    og_image: Optional[str] = Field(None, alias="ogImage")
    source_url: Optional[str] = Field(None, alias="sourceURL")
    status_code: Optional[int] = Field(None, alias="statusCode")
    error: Optional[str] = None

class Document(BaseModel):
    """A scraped document."""
    url: str
    markdown: Optional[str] = None
    html: Optional[str] = None
    raw_html: Optional[str] = Field(None, alias="rawHtml")
    content: Optional[str] = None
    metadata: Optional[DocumentMetadata] = None
    links: Optional[List[str]] = None
    screenshot: Optional[str] = None
    actions: Optional[Dict[str, Any]] = None

class Source(BaseModel):
    """Configuration for a search source."""
    type: str

SourceOption = Union[str, Source]

class Format(BaseModel):
    """Configuration for a format."""
    type: str

FormatOption = Union[str, Format]

# Scrape types
class ScrapeFormats(BaseModel):
    """Output formats for scraping."""
    formats: Optional[List[FormatOption]] = None
    markdown: bool = True
    html: bool = False
    raw_html: bool = Field(False, alias="rawHtml")
    content: bool = False
    links: bool = False
    screenshot: bool = False
    screenshot_full_page: bool = Field(False, alias="screenshot@fullPage")

    @field_validator('formats')
    @classmethod
    def validate_formats(cls, v):
        """Validate and normalize formats input."""
        if v is None:
            return v
        
        normalized_formats = []
        for format_item in v:
            if isinstance(format_item, str):
                normalized_formats.append(Format(type=format_item))
            elif isinstance(format_item, dict):
                normalized_formats.append(Format(**format_item))
            elif isinstance(format_item, Format):
                normalized_formats.append(format_item)
            else:
                raise ValueError(f"Invalid format format: {format_item}")
        
        return normalized_formats

class ScrapeOptions(BaseModel):
    """Options for scraping operations."""
    formats: Optional[ScrapeFormats] = None
    headers: Optional[Dict[str, str]] = None
    include_tags: Optional[List[str]] = Field(None, alias="includeTags")
    exclude_tags: Optional[List[str]] = Field(None, alias="excludeTags")
    only_main_content: bool = Field(True, alias="onlyMainContent")
    timeout: Optional[int] = None
    wait_for: Optional[int] = Field(None, alias="waitFor")
    mobile: bool = False
    skip_tls_verification: bool = Field(False, alias="skipTlsVerification")
    remove_base64_images: bool = Field(True, alias="removeBase64Images")

class ScrapeRequest(BaseModel):
    """Request for scraping a single URL."""
    url: str
    options: Optional[ScrapeOptions] = None

class ScrapeResponse(BaseResponse[Document]):
    """Response from scraping operation."""
    pass

# Crawl types
class CrawlOptions(BaseModel):
    """Options for crawling operations."""
    includes: Optional[List[str]] = None
    excludes: Optional[List[str]] = None
    generate_img_alt_text: bool = Field(False, alias="generateImgAltText")
    return_only_urls: bool = Field(False, alias="returnOnlyUrls")
    max_depth: Optional[int] = Field(None, alias="maxDepth")
    mode: Literal["default", "fast"] = "default"
    ignore_sitemap: bool = Field(False, alias="ignoreSitemap")
    limit: Optional[int] = None
    allow_backward_crawling: bool = Field(False, alias="allowBackwardCrawling")
    allow_external_content_links: bool = Field(False, alias="allowExternalContentLinks")
    scrape_options: Optional[ScrapeOptions] = Field(None, alias="scrapeOptions")

class CrawlRequest(BaseModel):
    """Request for crawling a website."""
    url: str
    options: Optional[CrawlOptions] = None

class CrawlJob(BaseModel):
    """Information about a crawl job."""
    id: str
    url: str
    status: Literal["scraping", "completed", "failed", "cancelled"]
    current: Optional[int] = None
    total: Optional[int] = None
    created_at: Optional[datetime] = Field(None, alias="createdAt")
    completed_at: Optional[datetime] = Field(None, alias="completedAt")

class CrawlResponse(BaseResponse[CrawlJob]):
    """Response from starting a crawl."""
    pass

class CrawlStatusData(BaseModel):
    """Data for crawl status response."""
    status: Literal["scraping", "completed", "failed", "cancelled"]
    current: int
    total: int
    data: List[Document]
    partial_data: Optional[List[Document]] = Field(None, alias="partialData")

class CrawlStatusResponse(BaseResponse[CrawlStatusData]):
    """Response from checking crawl status."""
    pass

# Batch scrape types
class BatchScrapeRequest(BaseModel):
    """Request for batch scraping multiple URLs."""
    urls: List[str]
    options: Optional[ScrapeOptions] = None

class BatchScrapeJob(BaseModel):
    """Information about a batch scrape job."""
    id: str
    status: Literal["scraping", "completed", "failed", "cancelled"]
    current: Optional[int] = None
    total: Optional[int] = None
    created_at: Optional[datetime] = Field(None, alias="createdAt")
    completed_at: Optional[datetime] = Field(None, alias="completedAt")

class BatchScrapeResponse(BaseResponse[BatchScrapeJob]):
    """Response from starting a batch scrape."""
    pass

class BatchScrapeStatusData(BaseModel):
    """Data for batch scrape status response."""
    status: Literal["scraping", "completed", "failed", "cancelled"]
    current: int
    total: int
    data: List[Document]

class BatchScrapeStatusResponse(BaseResponse[BatchScrapeStatusData]):
    """Response from checking batch scrape status."""
    pass

# Map types
class MapOptions(BaseModel):
    """Options for mapping operations."""
    search: Optional[str] = None
    ignore_sitemap: bool = Field(False, alias="ignoreSitemap")
    include_subdomains: bool = Field(False, alias="includeSubdomains")
    limit: Optional[int] = None

class MapRequest(BaseModel):
    """Request for mapping a website."""
    url: str
    options: Optional[MapOptions] = None

class MapData(BaseModel):
    """Data for map response."""
    links: List[str]

class MapResponse(BaseResponse[MapData]):
    """Response from mapping operation."""
    pass

# Action types
class WaitAction(BaseModel):
    """Wait action to perform during scraping."""
    type: Literal["wait"] = "wait"
    milliseconds: Optional[int] = None
    selector: Optional[str] = None

class ScreenshotAction(BaseModel):
    """Screenshot action to perform during scraping."""
    type: Literal["screenshot"] = "screenshot"
    full_page: Optional[bool] = Field(None, alias="fullPage")
    quality: Optional[int] = None

class ClickAction(BaseModel):
    """Click action to perform during scraping."""
    type: Literal["click"] = "click"
    selector: str

class WriteAction(BaseModel):
    """Write action to perform during scraping."""
    type: Literal["write"] = "write"
    text: str

class PressAction(BaseModel):
    """Press action to perform during scraping."""
    type: Literal["press"] = "press"
    key: str

class ScrollAction(BaseModel):
    """Scroll action to perform during scraping."""
    type: Literal["scroll"] = "scroll"
    direction: Literal["up", "down"]
    selector: Optional[str] = None

class ScrapeAction(BaseModel):
    """Scrape action to perform during scraping."""
    type: Literal["scrape"] = "scrape"

class ExecuteJavascriptAction(BaseModel):
    """Execute javascript action to perform during scraping."""
    type: Literal["executeJavascript"] = "executeJavascript"
    script: str

class PDFAction(BaseModel):
    """PDF action to perform during scraping."""
    type: Literal["pdf"] = "pdf"
    format: Optional[Literal["A0", "A1", "A2", "A3", "A4", "A5", "A6", "Letter", "Legal", "Tabloid", "Ledger"]] = None
    landscape: Optional[bool] = None
    scale: Optional[float] = None

# Location types
class Location(BaseModel):
    """Location configuration for scraping."""
    country: Optional[str] = None
    languages: Optional[List[str]] = None

# JSON format types
class JsonFormat(BaseModel):
    """Configuration for JSON extraction."""
    prompt: Optional[str] = None
    schema_field: Optional[Dict[str, Any]] = Field(None, alias="schema")
    system_prompt: Optional[str] = Field(None, alias="systemPrompt")

class SearchRequest(BaseModel):
    """Request for search operations."""
    query: str
    sources: Optional[List[SourceOption]] = None
    limit: Optional[int] = 5
    tbs: Optional[str] = None
    location: Optional[str] = None
    ignore_invalid_urls: Optional[bool] = Field(True, alias="ignoreInvalidURLs")
    timeout: Optional[int] = 60000
    scrape_options: Optional[ScrapeOptions] = Field(None, alias="scrapeOptions")

    @field_validator('sources')
    @classmethod
    def validate_sources(cls, v):
        """Validate and normalize sources input."""
        if v is None:
            return v
        
        normalized_sources = []
        for source in v:
            if isinstance(source, str):
                normalized_sources.append(Source(type=source))
            elif isinstance(source, dict):
                normalized_sources.append(Source(**source))
            elif isinstance(source, Source):
                normalized_sources.append(source)
            else:
                raise ValueError(f"Invalid source format: {source}")
        
        return normalized_sources

class SearchResult(BaseModel):
    """A search result with basic information."""
    url: str
    title: Optional[str] = None
    description: Optional[str] = None

class SearchResponse(BaseResponse[Dict[str, List[Union[SearchResult, Document]]]]):
    """Response from search operation."""
    pass

# Error types
class ErrorDetails(BaseModel):
    """Detailed error information."""
    code: Optional[str] = None
    message: str
    details: Optional[Dict[str, Any]] = None

class ErrorResponse(BaseModel):
    """Error response structure."""
    success: bool = False
    error: str
    details: Optional[ErrorDetails] = None

# Job management types
class JobStatus(BaseModel):
    """Generic job status information."""
    id: str
    status: Literal["pending", "scraping", "completed", "failed", "cancelled"]
    current: Optional[int] = None
    total: Optional[int] = None
    created_at: Optional[datetime] = Field(None, alias="createdAt")
    completed_at: Optional[datetime] = Field(None, alias="completedAt")
    expires_at: Optional[datetime] = Field(None, alias="expiresAt")

# Webhook types
class WebhookData(BaseModel):
    """Data sent to webhooks."""
    job_id: str = Field(alias="jobId")
    status: str
    current: Optional[int] = None
    total: Optional[int] = None
    data: Optional[List[Document]] = None
    error: Optional[str] = None

# Configuration types
class ClientConfig(BaseModel):
    """Configuration for the Firecrawl client."""
    api_key: str
    api_url: str = "https://api.firecrawl.dev"
    timeout: Optional[float] = None
    max_retries: int = 3
    backoff_factor: float = 0.5

# Union types for convenience
ScrapeResult = Union[Document, List[Document]]
CrawlResult = Union[CrawlJob, CrawlStatusData]
BatchResult = Union[BatchScrapeJob, BatchScrapeStatusData]
JobResult = Union[CrawlJob, BatchScrapeJob]
StatusResult = Union[CrawlStatusData, BatchScrapeStatusData]

# Response union types
AnyResponse = Union[
    ScrapeResponse,
    CrawlResponse,
    CrawlStatusResponse,
    BatchScrapeResponse,
    BatchScrapeStatusResponse,
    MapResponse,
    SearchResponse,
    ErrorResponse
]