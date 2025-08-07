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
    
    # Apply default values for None fields
    default_values = {
        "only_main_content": True,
        "mobile": False,
        "skip_tls_verification": True,
        "remove_base64_images": True,
        "fast_mode": False,
        "block_ads": True,
        "max_age": 14400000,
        "store_in_cache": True
    }
    
    # Convert to dict and handle manual snake_case to camelCase conversion
    options_data = validated_options.model_dump(exclude_none=True)
    
    # Apply defaults for None fields
    for field, default_value in default_values.items():
        if field not in options_data:
            options_data[field] = default_value
    
    scrape_data = {}
    
    # Manual field mapping for snake_case to camelCase conversion
    field_mappings = {
        "include_tags": "includeTags",
        "exclude_tags": "excludeTags",
        "only_main_content": "onlyMainContent",
        "wait_for": "waitFor",
        "skip_tls_verification": "skipTlsVerification",
        "remove_base64_images": "removeBase64Images",
        "fast_mode": "fastMode",
        "use_mock": "useMock",
        "block_ads": "blockAds",
        "store_in_cache": "storeInCache",
        "max_age": "maxAge"
    }
    
    # Apply field mappings
    for snake_case, camel_case in field_mappings.items():
        if snake_case in options_data:
            scrape_data[camel_case] = options_data.pop(snake_case)
    
    # Handle special cases
    for key, value in options_data.items():
        if value is not None:
            if key == "formats":
                # Handle formats conversion
                converted_formats = []
                for fmt in value:
                    if isinstance(fmt, str):
                        # Handle format strings
                        if fmt == "json":
                            raise ValueError("json format must be an object with 'type', 'prompt', and 'schema' fields")
                        converted_formats.append(_convert_format_string(fmt))
                    elif isinstance(fmt, dict):
                        # Handle format objects
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
            elif key == "actions":
                # Handle actions conversion
                converted_actions = []
                for action in value:
                    if isinstance(action, dict):
                        # Convert action dict
                        converted_action = {}
                        for action_key, action_value in action.items():
                            if action_key == "full_page":
                                converted_action["fullPage"] = action_value
                            else:
                                converted_action[action_key] = action_value
                        converted_actions.append(converted_action)
                    else:
                        # Handle action objects
                        action_data = action.model_dump(exclude_none=True)
                        converted_action = {}
                        for action_key, action_value in action_data.items():
                            if action_key == "full_page":
                                converted_action["fullPage"] = action_value
                            else:
                                converted_action[action_key] = action_value
                        converted_actions.append(converted_action)
                scrape_data["actions"] = converted_actions
            elif key == "location":
                # Handle location conversion
                if isinstance(value, dict):
                    scrape_data["location"] = value
                else:
                    scrape_data["location"] = value.model_dump(exclude_none=True)
            else:
                # For fields that don't need conversion, use as-is
                scrape_data[key] = value
    
    return scrape_data 