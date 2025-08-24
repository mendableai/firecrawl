"""
Firecrawl Python SDK

"""

import logging
import os
from typing import Dict, List, Optional, Union, Literal, Any
from pydantic import BaseModel, Field

# Backward-compatible ScrapeOptions class for users migrating from older versions
class ScrapeOptions(BaseModel):
    """
    Configuration options for scraping operations.
    Supports both camelCase (legacy) and snake_case (modern) field names for backward compatibility.
    """
    # Modern snake_case fields (preferred)
    formats: Optional[List[Literal["markdown", "html", "rawHtml", "content", "links", "screenshot", "screenshot@fullPage", "extract", "json", "changeTracking"]]] = None
    headers: Optional[Dict[str, str]] = None
    include_tags: Optional[List[str]] = None
    exclude_tags: Optional[List[str]] = None
    only_main_content: Optional[bool] = None
    wait_for: Optional[int] = None
    timeout: Optional[int] = None
    location: Optional[Dict[str, Any]] = None
    mobile: Optional[bool] = None
    skip_tls_verification: Optional[bool] = None
    remove_base64_images: Optional[bool] = None
    block_ads: Optional[bool] = None
    proxy: Optional[Literal["basic", "stealth", "auto"]] = None
    parse_pdf: Optional[bool] = None
    extract: Optional[Dict[str, Any]] = None
    actions: Optional[List[Dict[str, Any]]] = None
    max_age: Optional[int] = None
    
    # Legacy camelCase fields with aliases for backward compatibility
    onlyMainContent: Optional[bool] = Field(None, alias="only_main_content")
    waitFor: Optional[int] = Field(None, alias="wait_for")
    skipTlsVerification: Optional[bool] = Field(None, alias="skip_tls_verification")
    removeBase64Images: Optional[bool] = Field(None, alias="remove_base64_images")
    blockAds: Optional[bool] = Field(None, alias="block_ads")
    parsePDF: Optional[bool] = Field(None, alias="parse_pdf")
    maxAge: Optional[int] = Field(None, alias="max_age")
    includeTags: Optional[List[str]] = Field(None, alias="include_tags")
    excludeTags: Optional[List[str]] = Field(None, alias="exclude_tags")
    
    class Config:
        allow_population_by_field_name = True
        extra = "allow"  # Allow additional fields for flexibility
        
    def to_dict(self) -> Dict[str, Any]:
        """Convert ScrapeOptions to dictionary format expected by the API."""
        result = {}
        data = self.dict(by_alias=False, exclude_none=True)
        
        # Handle field name conversions
        field_mappings = {
            "include_tags": "includeTags",
            "exclude_tags": "excludeTags", 
            "only_main_content": "onlyMainContent",
            "wait_for": "waitFor",
            "skip_tls_verification": "skipTlsVerification",
            "remove_base64_images": "removeBase64Images",
            "block_ads": "blockAds",
            "parse_pdf": "parsePDF",
            "max_age": "maxAge"
        }
        
        for key, value in data.items():
            if key in field_mappings:
                result[field_mappings[key]] = value
            else:
                result[key] = value
                
        return result

# Helper function to normalize scrape options
def _normalize_scrape_options(scrape_options: Optional[Union[ScrapeOptions, Dict[str, Any]]]) -> Optional[Dict[str, Any]]:
    """
    Normalize scrape_options to dictionary format.
    Handles both ScrapeOptions class instances and plain dictionaries.
    """
    if scrape_options is None:
        return None
    
    if isinstance(scrape_options, ScrapeOptions):
        return scrape_options.to_dict()
    elif isinstance(scrape_options, dict):
        return scrape_options
    else:
        # Try to convert to dict if it has dict-like methods
        if hasattr(scrape_options, 'dict'):
            return scrape_options.dict(exclude_none=True)
        elif hasattr(scrape_options, '__dict__'):
            return {k: v for k, v in scrape_options.__dict__.items() if v is not None}
        else:
            return scrape_options

from .client import Firecrawl, AsyncFirecrawl, FirecrawlApp, AsyncFirecrawlApp
from .v2.watcher import Watcher
from .v2.watcher_async import AsyncWatcher
from .v1 import (
    V1FirecrawlApp,
    AsyncV1FirecrawlApp,
    V1JsonConfig,
    V1ScrapeOptions,
    V1ChangeTrackingOptions,
)

__version__ = "3.3.2"

# Define the logger for the Firecrawl project
logger: logging.Logger = logging.getLogger("firecrawl")


def _configure_logger() -> None:
    """
    Configure the firecrawl logger for console output.

    The function attaches a handler for console output with a specific format and date
    format to the firecrawl logger.
    """
    try:
        formatter = logging.Formatter(
            "[%(asctime)s - %(name)s:%(lineno)d - %(levelname)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)

        logger.addHandler(console_handler)
    except Exception as e:
        logger.error("Failed to configure logging: %s", e)


def setup_logging() -> None:
    """Set up logging based on the FIRECRAWL_LOGGING_LEVEL environment variable."""
    if logger.hasHandlers():
        return

    if not (env := os.getenv("FIRECRAWL_LOGGING_LEVEL", "").upper()):
        logger.addHandler(logging.NullHandler()) 
        return

    _configure_logger()

    if env == "DEBUG":
        logger.setLevel(logging.DEBUG)
    elif env == "INFO":
        logger.setLevel(logging.INFO)
    elif env == "WARNING":
        logger.setLevel(logging.WARNING)
    elif env == "ERROR":
        logger.setLevel(logging.ERROR)
    elif env == "CRITICAL":
        logger.setLevel(logging.CRITICAL)
    else:
        logger.setLevel(logging.INFO)
        logger.warning("Unknown logging level: %s, defaulting to INFO", env)

setup_logging()
logger.debug("Debugging logger setup")

__all__ = [
    'Firecrawl',
    'AsyncFirecrawl',
    'FirecrawlApp',
    'AsyncFirecrawlApp',
    'Watcher',
    'AsyncWatcher',
    'V1FirecrawlApp',
    'AsyncV1FirecrawlApp',
    'V1JsonConfig',
    'V1ScrapeOptions',
    'V1ChangeTrackingOptions',
    'ScrapeOptions',
    '_normalize_scrape_options',
]
