"""
Shared validation functions for Firecrawl v2 API.
"""

from typing import Optional, Dict, Any
from ..types import ScrapeOptions


def _convert_format_string(format_str: str) -> str:
    """
    Convert format string from snake_case to camelCase.
    
    Args:
        format_str: Format string in snake_case
        
    Returns:
        Format string in camelCase
    """
    format_mapping = {
        "raw_html": "rawHtml",
        "change_tracking": "changeTracking",
        "screenshot_full_page": "screenshot@fullPage"
    }
    return format_mapping.get(format_str, format_str)


def _validate_json_format(format_obj: Any) -> Dict[str, Any]:
    """
    Validate and prepare json format object.
    
    Args:
        format_obj: Format object that should be json type
        
    Returns:
        Validated json format dict
        
    Raises:
        ValueError: If json format is missing required fields
    """
    if not isinstance(format_obj, dict):
        raise ValueError("json format must be an object with 'type', 'prompt', and 'schema' fields")
    
    if format_obj.get('type') != 'json':
        raise ValueError("json format must have type='json'")
    
    if 'prompt' not in format_obj:
        raise ValueError("json format requires 'prompt' field")
    
    if 'schema' not in format_obj:
        raise ValueError("json format requires 'schema' field")
    
    return format_obj


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
                if isinstance(value, dict) and any(key in value for key in ['markdown', 'html', 'raw_html', 'content', 'links', 'screenshot', 'screenshot_full_page']):
                    # Convert ScrapeFormats boolean flags to format strings
                    formats = []
                    if value.get('markdown', False):
                        formats.append("markdown")
                    if value.get('html', False):
                        formats.append("html")
                    if value.get('raw_html', False):
                        formats.append("rawHtml")
                    if value.get('content', False):
                        formats.append("content")
                    if value.get('links', False):
                        formats.append("links")
                    if value.get('screenshot', False):
                        formats.append("screenshot")
                    if value.get('screenshot_full_page', False):
                        formats.append("screenshot@fullPage")
                    scrape_data["formats"] = formats
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
                elif hasattr(value, 'formats') and value.formats is not None:
                    # Convert format strings from snake_case to camelCase
                    converted_formats = []
                    for fmt in value.formats:
                        if isinstance(fmt, str):
                            converted_formats.append(_convert_format_string(fmt))
                        elif hasattr(fmt, 'type'):
                            converted_formats.append(_convert_format_string(fmt.type))
                        else:
                            converted_formats.append(fmt)
                    scrape_data["formats"] = converted_formats
                elif isinstance(value, list):
                    # If it's already a list, convert format strings from snake_case to camelCase
                    converted_formats = []
                    for fmt in value:
                        if isinstance(fmt, str):
                            # Handle json format specially - it can't be a string
                            if fmt == "json":
                                raise ValueError("json format must be an object with 'type', 'prompt', and 'schema' fields")
                            converted_formats.append(_convert_format_string(fmt))
                        elif isinstance(fmt, dict):
                            # Handle format objects (like json format)
                            if fmt.get('type') == 'json':
                                validated_json = _validate_json_format(fmt)
                                converted_formats.append(validated_json)
                            else:
                                # Convert other format objects
                                if 'type' in fmt:
                                    fmt['type'] = _convert_format_string(fmt['type'])
                                converted_formats.append(fmt)
                        elif hasattr(fmt, 'type'):
                            # Handle Format objects
                            if fmt.type == 'json':
                                # For json format, we need the full object
                                converted_formats.append(fmt.model_dump())
                            else:
                                # For other formats, just convert the type
                                converted_formats.append(_convert_format_string(fmt.type))
                        else:
                            converted_formats.append(fmt)
                    scrape_data["formats"] = converted_formats
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
            # Note: raw_html should be in formats array, not as a separate field
            # Note: screenshot_full_page is not supported by v2 API
            # elif key == "screenshot_full_page":
            #     scrape_data["screenshot@fullPage"] = value
            else:
                # For fields that don't need conversion, use as-is
                scrape_data[key] = value
    
    return scrape_data 