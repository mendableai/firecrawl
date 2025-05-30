import pydantic
from typing import Optional, List, Dict, Literal, Any, Union, Generic, TypeVar
from datetime import datetime
import warnings

T = TypeVar('T')

# Suppress Pydantic warnings about attribute shadowing
warnings.filterwarnings("ignore", message="Field name \"json\" in \"FirecrawlDocument\" shadows an attribute in parent \"BaseModel\"")
warnings.filterwarnings("ignore", message="Field name \"json\" in \"ChangeTrackingData\" shadows an attribute in parent \"BaseModel\"")
warnings.filterwarnings("ignore", message="Field name \"schema\" in \"JsonConfig\" shadows an attribute in parent \"BaseModel\"")
warnings.filterwarnings("ignore", message="Field name \"schema\" in \"ExtractParams\" shadows an attribute in parent \"BaseModel\"")
warnings.filterwarnings("ignore", message="Field name \"schema\" in \"ChangeTrackingOptions\" shadows an attribute in parent \"BaseModel\"")

# class FirecrawlDocumentMetadata(pydantic.BaseModel):
#     """Metadata for a Firecrawl document."""
#     title: Optional[str] = None
#     description: Optional[str] = None
#     language: Optional[str] = None
#     keywords: Optional[str] = None
#     robots: Optional[str] = None
#     ogTitle: Optional[str] = None
#     ogDescription: Optional[str] = None
#     ogUrl: Optional[str] = None
#     ogImage: Optional[str] = None
#     ogAudio: Optional[str] = None
#     ogDeterminer: Optional[str] = None
#     ogLocale: Optional[str] = None
#     ogLocaleAlternate: Optional[List[str]] = None
#     ogSiteName: Optional[str] = None
#     ogVideo: Optional[str] = None
#     dctermsCreated: Optional[str] = None
#     dcDateCreated: Optional[str] = None
#     dcDate: Optional[str] = None
#     dctermsType: Optional[str] = None
#     dcType: Optional[str] = None
#     dctermsAudience: Optional[str] = None
#     dctermsSubject: Optional[str] = None
#     dcSubject: Optional[str] = None
#     dcDescription: Optional[str] = None
#     dctermsKeywords: Optional[str] = None
#     modifiedTime: Optional[str] = None
#     publishedTime: Optional[str] = None
#     articleTag: Optional[str] = None
#     articleSection: Optional[str] = None
#     sourceURL: Optional[str] = None
#     statusCode: Optional[int] = None
#     error: Optional[str] = None

class AgentOptions(pydantic.BaseModel):
    """Configuration for the agent."""
    model: Literal["FIRE-1"] = "FIRE-1"
    prompt: Optional[str] = None

class AgentOptionsExtract(pydantic.BaseModel):
    """Configuration for the agent in extract operations."""
    model: Literal["FIRE-1"] = "FIRE-1"

class ActionsResult(pydantic.BaseModel):
    """Result of actions performed during scraping."""
    screenshots: List[str]

class ChangeTrackingData(pydantic.BaseModel):
    """
    Data for the change tracking format.
    """
    previous_scrape_at: Optional[str] = None
    change_status: str  # "new" | "same" | "changed" | "removed"
    visibility: str  # "visible" | "hidden"
    diff: Optional[Dict[str, Any]] = None
    json: Optional[Any] = None

class ExtractAgent(pydantic.BaseModel):
    """Configuration for the agent in extract operations."""
    model: Literal["FIRE-1"] = "FIRE-1"

class JsonConfig(pydantic.BaseModel):
    """Configuration for extraction."""
    prompt: Optional[str] = None
    schema: Optional[Any] = None
    system_prompt: Optional[str] = None
    agent: Optional[ExtractAgent] = None

class FirecrawlDocument(pydantic.BaseModel, Generic[T]):
    """Document retrieved or processed by Firecrawl."""
    url: Optional[str] = None
    markdown: Optional[str] = None
    html: Optional[str] = None
    raw_html: Optional[str] = None
    links: Optional[List[str]] = None
    extract: Optional[T] = None
    json: Optional[T] = None
    screenshot: Optional[str] = None
    metadata: Optional[Any] = None
    actions: Optional[ActionsResult] = None
    title: Optional[str] = None  # v1 search only
    description: Optional[str] = None  # v1 search only
    change_tracking: Optional[ChangeTrackingData] = None

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

class ChangeTrackingOptions(pydantic.BaseModel):
    """Configuration for change tracking."""
    modes: Optional[List[Literal["git-diff", "json"]]] = None
    schema: Optional[Any] = None
    prompt: Optional[str] = None

class WaitAction(pydantic.BaseModel):
    """Wait action to perform during scraping."""
    type: Literal["wait"] = pydantic.Field(default="wait")
    milliseconds: Optional[int] = None
    selector: Optional[str] = None

class ScreenshotAction(pydantic.BaseModel):
    """Screenshot action to perform during scraping."""
    type: Literal["screenshot"] = pydantic.Field(default="screenshot")
    full_page: Optional[bool] = None

class ClickAction(pydantic.BaseModel):
    """Click action to perform during scraping."""
    type: Literal["click"] = pydantic.Field(default="click")
    selector: str

class WriteAction(pydantic.BaseModel):
    """Write action to perform during scraping."""
    type: Literal["write"] = pydantic.Field(default="write")
    text: str

class PressAction(pydantic.BaseModel):
    """Press action to perform during scraping."""
    type: Literal["press"] = pydantic.Field(default="press")
    key: str

class ScrollAction(pydantic.BaseModel):
    """Scroll action to perform during scraping."""
    type: Literal["scroll"] = pydantic.Field(default="scroll")
    direction: Literal["up", "down"]
    selector: Optional[str] = None

class ScrapeAction(pydantic.BaseModel):
    """Scrape action to perform during scraping."""
    type: Literal["scrape"] = pydantic.Field(default="scrape")

class ExecuteJavascriptAction(pydantic.BaseModel):
    """Execute javascript action to perform during scraping."""
    type: Literal["executeJavascript"] = pydantic.Field(default="executeJavascript")
    script: str

class ScrapeOptions(pydantic.BaseModel):
    """Parameters for scraping operations."""
    formats: Optional[List[Literal["markdown", "html", "raw_html", "links", "screenshot", "screenshot@full_page", "extract", "json", "change_tracking"]]] = None
    headers: Optional[Dict[str, str]] = None
    include_tags: Optional[List[str]] = None
    exclude_tags: Optional[List[str]] = None
    only_main_content: Optional[bool] = None
    wait_for: Optional[int] = None
    timeout: Optional[int] = None
    location: Optional[LocationConfig] = None
    mobile: Optional[bool] = None
    skip_tls_verification: Optional[bool] = None
    remove_base64_images: Optional[bool] = None
    block_ads: Optional[bool] = None
    proxy: Optional[Literal["basic", "stealth"]] = None
    change_tracking_options: Optional[ChangeTrackingOptions] = None
    extract: Optional[JsonConfig] = None
    json_options: Optional[JsonConfig] = None
    actions: Optional[List[Union[WaitAction, ScreenshotAction, ClickAction, WriteAction, PressAction, ScrollAction, ScrapeAction, ExecuteJavascriptAction]]] = None
    agent: Optional[AgentOptions] = None

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
    invalid_urls: Optional[List[str]] = None

class BatchScrapeStatusResponse(pydantic.BaseModel):
    """Response from batch scrape status checks."""
    success: bool = True
    status: Literal["scraping", "completed", "failed", "cancelled"]
    completed: int
    total: int
    credits_used: int
    expires_at: datetime
    next: Optional[str] = None
    data: List[FirecrawlDocument]

class CrawlParams(pydantic.BaseModel):
    """Parameters for crawling operations."""
    include_paths: Optional[List[str]] = None
    exclude_paths: Optional[List[str]] = None
    max_depth: Optional[int] = None
    max_discovery_depth: Optional[int] = None
    limit: Optional[int] = None
    allow_backward_links: Optional[bool] = None
    allow_external_links: Optional[bool] = None
    ignore_sitemap: Optional[bool] = None
    scrape_options: Optional[ScrapeOptions] = None
    webhook: Optional[Union[str, WebhookConfig]] = None
    deduplicate_similar_urls: Optional[bool] = None
    ignore_query_parameters: Optional[bool] = None
    regex_on_full_url: Optional[bool] = None
    delay: Optional[int] = None  # Delay in seconds between scrapes

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
    credits_used: int
    expires_at: datetime
    next: Optional[str] = None
    data: Optional[List[FirecrawlDocument]] = None
    error: Optional[str] = None

class CrawlErrorsResponse(pydantic.BaseModel):
    """Response from crawl/batch scrape error monitoring."""
    errors: List[Dict[str, str]]  # {id: str, timestamp: str, url: str, error: str}
    robots_blocked: List[str]

class MapParams(pydantic.BaseModel):
    """Parameters for mapping operations."""
    search: Optional[str] = None
    ignore_sitemap: Optional[bool] = None
    include_subdomains: Optional[bool] = None
    sitemap_only: Optional[bool] = None
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
    system_prompt: Optional[str] = None
    allow_external_links: Optional[bool] = None
    enable_web_search: Optional[bool] = None
    include_subdomains: Optional[bool] = None
    origin: Optional[str] = None
    show_sources: Optional[bool] = None
    scrape_options: Optional[ScrapeOptions] = None

class ExtractResponse(pydantic.BaseModel, Generic[T]):
    """Response from extract operations."""
    id: Optional[str] = None
    status: Optional[Literal["processing", "completed", "failed"]] = None
    expires_at: Optional[datetime] = None
    success: bool = True
    data: Optional[T] = None
    error: Optional[str] = None
    warning: Optional[str] = None
    sources: Optional[Union[List[str], Dict[str, List[str]]]] = None

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
    scrape_options: Optional[ScrapeOptions] = None

class SearchResponse(pydantic.BaseModel):
    """Response from search operations."""
    success: bool = True
    data: List[FirecrawlDocument]
    warning: Optional[str] = None
    error: Optional[str] = None
    
class SearchResponse(pydantic.BaseModel):
    """
    Response from the search operation.
    """
    success: bool
    data: List[Dict[str, Any]]
    warning: Optional[str] = None
    error: Optional[str] = None

class ExtractParams(pydantic.BaseModel):
    """
    Parameters for the extract operation.
    """
    prompt: Optional[str] = None
    schema: Optional[Any] = pydantic.Field(None, alias='schema')
    system_prompt: Optional[str] = None
    allow_external_links: Optional[bool] = False
    enable_web_search: Optional[bool] = False
    show_sources: Optional[bool] = False
    agent: Optional[Dict[str, Any]] = None