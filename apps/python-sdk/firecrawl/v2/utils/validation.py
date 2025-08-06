"""
Shared validation functions for Firecrawl v2 API.
"""

from typing import Optional, Dict, Any
from ..types import ScrapeOptions


def validate_scrape_options(options: Optional[ScrapeOptions]) -> Optional[ScrapeOptions]:
    """
    Validate and normalize scrape options.
    
    Args:
        options: Scraping options to validate
        
    Returns:
        Validated options or None
        
    Raises:
        ValueError: If options are invalid
    """
    if options is None:
        return None
    
    # Validate timeout
    if options.timeout is not None and options.timeout <= 0:
        raise ValueError("Timeout must be positive")
    
    # Validate wait_for
    if options.wait_for is not None and options.wait_for < 0:
        raise ValueError("wait_for must be non-negative")
    
    return options


def prepare_scrape_options(options: Optional[ScrapeOptions]) -> Optional[Dict[str, Any]]:
    """
    Prepare ScrapeOptions for API submission with manual snake_case to camelCase conversion.
    
    Args:
        options: ScrapeOptions to prepare
        
    Returns:
        Dictionary ready for API submission or None if options is None
    """
    if options is None:
        return None
    
    # Validate options first
    validated_options = validate_scrape_options(options)
    if validated_options is None:
        return None
    
    # Convert to dict and handle manual snake_case to camelCase conversion
    options_data = validated_options.model_dump(exclude_none=True)
    scrape_data = {}
    
    for key, value in options_data.items():
        if value is not None:
            if key == "formats":
                # Handle formats - if it's a ScrapeFormats object, convert boolean flags to format strings
                if hasattr(value, 'formats') and value.formats is not None:
                    scrape_data["formats"] = value.formats
                elif hasattr(value, 'markdown') or hasattr(value, 'html') or hasattr(value, 'raw_html') or hasattr(value, 'content') or hasattr(value, 'links') or hasattr(value, 'screenshot') or hasattr(value, 'screenshot_full_page'):
                    # Convert ScrapeFormats boolean flags to format strings
                    formats = []
                    if getattr(value, 'markdown', False):
                        formats.append("markdown")
                    if getattr(value, 'html', False):
                        formats.append("html")
                    if getattr(value, 'raw_html', False):
                        formats.append("rawHtml")
                    if getattr(value, 'content', False):
                        formats.append("content")
                    if getattr(value, 'links', False):
                        formats.append("links")
                    if getattr(value, 'screenshot', False):
                        formats.append("screenshot")
                    if getattr(value, 'screenshot_full_page', False):
                        formats.append("screenshot@fullPage")
                    scrape_data["formats"] = formats
                elif isinstance(value, list):
                    # If it's already a list, use it directly
                    scrape_data["formats"] = value
                else:
                    # Fallback - use the value as-is
                    scrape_data["formats"] = value
            elif key == "include_tags":
                scrape_data["includeTags"] = value
            elif key == "exclude_tags":
                scrape_data["excludeTags"] = value
            elif key == "only_main_content":
                scrape_data["onlyMainContent"] = value
            elif key == "wait_for":
                scrape_data["waitFor"] = value
            elif key == "skip_tls_verification":
                scrape_data["skipTlsVerification"] = value
            elif key == "remove_base64_images":
                scrape_data["removeBase64Images"] = value
            elif key == "block_ads":
                scrape_data["blockAds"] = value
            elif key == "store_in_cache":
                scrape_data["storeInCache"] = value
            elif key == "max_age":
                scrape_data["maxAge"] = value
            # Note: raw_html and screenshot_full_page are not supported by v2 API yet
            # elif key == "raw_html":
            #     scrape_data["rawHtml"] = value
            # elif key == "screenshot_full_page":
            #     scrape_data["screenshot@fullPage"] = value
            else:
                # For fields that don't need conversion, use as-is
                scrape_data[key] = value
    
    return scrape_data 