"""
Utility functions for the Firecrawl SDK.
"""
import re
from typing import Any, Dict, List, Union, TypeVar, Generic, Optional, TypedDict, Literal
from .types import LocationConfig, JsonConfig, ChangeTrackingOptions, WaitAction, ScreenshotAction, WriteAction, PressAction, ScrollAction, ExecuteJavascriptAction, AgentOptions
T = TypeVar('T')

class DeepResearchDataSource(TypedDict, total=False):
    """Type definition for a source in deep research data."""
    url: str
    title: str
    content: str
    summary: str


class DeepResearchData(TypedDict, total=False):
    """Type definition for deep research data."""
    final_analysis: str
    sources: List[DeepResearchDataSource]


class DeepResearchResponse(TypedDict, total=False):
    """Type definition for deep research response."""
    success: bool
    status: str
    current_depth: int
    max_depth: int
    activities: List[Dict[str, Any]]
    summaries: List[str]
    data: DeepResearchData


def camel_to_snake(name: str) -> str:
    """
    Convert a camelCase string to snake_case.
    
    Args:
        name (str): The camelCase string to convert.
        
    Returns:
        str: The snake_case string.
    """
    if not name:
        return name
        
    s1 = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', name)
    return re.sub('([a-z0-9])([A-Z])', r'\1_\2', s1).lower()


def convert_dict_keys_to_snake_case(data: Any) -> Any:
    """
    Recursively convert all dictionary keys from camelCase to snake_case.
    
    Args:
        data (Any): The data to convert. Can be a dictionary, list, or primitive type.
        
    Returns:
        Any: The converted data with snake_case keys.
    """
    if isinstance(data, dict):
        return {camel_to_snake(k): convert_dict_keys_to_snake_case(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [convert_dict_keys_to_snake_case(item) for item in data]
    else:
        return data


class DotDict(dict, Generic[T]):
    """
    A dictionary that supports dot notation access to its items.
    
    Example:
        >>> d = DotDict({'foo': 'bar'})
        >>> d.foo
        'bar'
        >>> d['foo']
        'bar'
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for key, value in self.items():
            if isinstance(value, dict):
                self[key] = DotDict(value)
            elif isinstance(value, list):
                self[key] = [DotDict(item) if isinstance(item, dict) else item for item in value]
    
    def __getattr__(self, key: str) -> Any:
        try:
            return self[key]
        except KeyError:
            raise AttributeError(f"'DotDict' object has no attribute '{key}'")
    
    def __setattr__(self, key: str, value: Any) -> None:
        self[key] = value


def convert_to_dot_dict(data: Union[Dict[str, Any], List[Any], Any]) -> Union[DotDict[Any], List[Any], Any]:
    """
    Convert a dictionary or list of dictionaries to DotDict objects.
    
    Args:
        data (Union[Dict[str, Any], List[Any], Any]): The data to convert.
        
    Returns:
        Union[DotDict[Any], List[Any], Any]: The converted data with DotDict objects.
    """
    if isinstance(data, dict):
        return DotDict(data)
    elif isinstance(data, list):
        return [convert_to_dot_dict(item) for item in data]
    else:
        return data
    
def ensure_schema_dict(schema):
    """
    Utility to ensure a schema is a dict, not a Pydantic model class. Recursively checks dicts and lists.
    """
    if schema is None:
        return schema
    if isinstance(schema, type):
        # Pydantic v1/v2 model class
        if hasattr(schema, 'model_json_schema'):
            return schema.model_json_schema()
        elif hasattr(schema, 'schema'):
            return schema.schema()
    if isinstance(schema, dict):
        return {k: ensure_schema_dict(v) for k, v in schema.items()}
    if isinstance(schema, (list, tuple)):
        return [ensure_schema_dict(v) for v in schema]
    return schema

def parse_scrape_options(
        formats: Optional[List[Literal["markdown", "html", "raw_html", "links", "screenshot", "screenshot@full_page", "extract", "json", "change_tracking"]]] = None,
        include_tags: Optional[List[str]] = None,
        exclude_tags: Optional[List[str]] = None,
        only_main_content: Optional[bool] = None,
        wait_for: Optional[int] = None,
        timeout: Optional[int] = None,
        location: Optional[LocationConfig] = None,
        mobile: Optional[bool] = None,
        skip_tls_verification: Optional[bool] = None,
        remove_base64_images: Optional[bool] = None,
        block_ads: Optional[bool] = None,
        proxy: Optional[str] = None,
        extract: Optional[JsonConfig] = None,
        json_options: Optional[JsonConfig] = None,
        actions: Optional[List[Union[WaitAction, ScreenshotAction, WriteAction, PressAction, ScrollAction, ExecuteJavascriptAction]]] = None,
        change_tracking_options: Optional[ChangeTrackingOptions] = None,
        agent: Optional[AgentOptions] = None,
        **kwargs: Any
    ) -> Dict[str, Any]:
    """
    Parse the scrape options and return a dictionary of parameters for the API request.
    """

    scrape_params = {}

    # Add optional parameters if provided and not None
    if formats:
        scrape_params['formats'] = scrape_formats_transform(formats)
    if include_tags:
        scrape_params['includeTags'] = include_tags
    if exclude_tags:
        scrape_params['excludeTags'] = exclude_tags
    if only_main_content is not None:
        scrape_params['onlyMainContent'] = only_main_content
    if wait_for:
        scrape_params['waitFor'] = wait_for
    if timeout:
        scrape_params['timeout'] = timeout
    if location is not None:
        scrape_params['location'] = {
            "country": location.country,
            "languages": location.languages
        }
    if mobile is not None:
        scrape_params['mobile'] = mobile
    if skip_tls_verification is not None:
        scrape_params['skipTlsVerification'] = skip_tls_verification
    if remove_base64_images is not None:
        scrape_params['removeBase64Images'] = remove_base64_images
    if block_ads is not None:
        scrape_params['blockAds'] = block_ads
    if proxy:
        scrape_params['proxy'] = proxy
    if extract is not None:
        extract = ensure_schema_dict(extract)
        if isinstance(extract, dict) and "schema" in extract:
            extract["schema"] = ensure_schema_dict(extract["schema"])
        scrape_params['extract'] = extract if isinstance(extract, dict) else extract.model_dump(exclude_none=True)
    if json_options is not None:
        json_options = ensure_schema_dict(json_options)
        if isinstance(json_options, dict) and "schema" in json_options:
            json_options["schema"] = ensure_schema_dict(json_options["schema"])
        
        # Convert to dict if it's a JsonConfig object
        if hasattr(json_options, 'dict'):
            json_options_dict = json_options.model_dump(exclude_none=True)
        else:
            json_options_dict = json_options
        
        # Convert snake_case to camelCase for API
        json_options_api = {}
        if 'prompt' in json_options_dict and json_options_dict['prompt'] is not None:
            json_options_api['prompt'] = json_options_dict['prompt']
        if 'schema' in json_options_dict and json_options_dict['schema'] is not None:
            json_options_api['schema'] = json_options_dict['schema']
        if 'system_prompt' in json_options_dict and json_options_dict['system_prompt'] is not None:
            json_options_api['systemPrompt'] = json_options_dict['system_prompt']
        if 'agent' in json_options_dict and json_options_dict['agent'] is not None:
            json_options_api['agent'] = json_options_dict['agent']
        
        scrape_params['jsonOptions'] = json_options_api
    if actions:
        scrape_params['actions'] = [action if isinstance(action, dict) else action.model_dump(exclude_none=True) for action in actions]
    if change_tracking_options is not None:
        change_tracking_dict = change_tracking_options if isinstance(change_tracking_options, dict) else change_tracking_options.model_dump(exclude_none=True)
        
        # Convert snake_case to camelCase for API
        change_tracking_api = {}
        if 'modes' in change_tracking_dict and change_tracking_dict['modes'] is not None:
            change_tracking_api['modes'] = change_tracking_dict['modes']
        if 'schema' in change_tracking_dict and change_tracking_dict['schema'] is not None:
            change_tracking_api['schema'] = change_tracking_dict['schema']
        if 'prompt' in change_tracking_dict and change_tracking_dict['prompt'] is not None:
            change_tracking_api['prompt'] = change_tracking_dict['prompt']
        
        scrape_params['changeTrackingOptions'] = change_tracking_api

    if 'extract' in scrape_params and scrape_params['extract'] and 'schema' in scrape_params['extract']:
        scrape_params['extract']['schema'] = ensure_schema_dict(scrape_params['extract']['schema'])
    if 'jsonOptions' in scrape_params and scrape_params['jsonOptions'] and 'schema' in scrape_params['jsonOptions']:
        scrape_params['jsonOptions']['schema'] = ensure_schema_dict(scrape_params['jsonOptions']['schema'])

    if agent:
        scrape_params['agent'] = agent

    if 'agent' in scrape_params and scrape_params['agent'] and 'model' in scrape_params['agent']:
        scrape_params['agent']['model'] = scrape_params['agent']['model'].value

    # Add any additional kwargs
    scrape_params.update(kwargs)

    return scrape_params

def scrape_formats_transform(formats: List[str]) -> List[str]:
    """
    Transform the formats from snake_case to camelCase (API format).
    """
    if 'screenshot@full_page' in formats:
        formats.remove('screenshot@full_page')
        formats.append('screenshot@fullPage')

    if 'change_tracking' in formats:
        formats.remove('change_tracking')
        formats.append('changeTracking')

    if 'raw_html' in formats:
        formats.remove('raw_html')
        formats.append('rawHtml')

    return formats

def scrape_formats_response_transform(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Transform the data response formats from camelCase (API format) to snake_case.
    """
    if 'changeTracking' in data:
        data['change_tracking'] = data['changeTracking']
        del data['changeTracking']
        
    if 'rawHtml' in data:
        data['raw_html'] = data['rawHtml']
        del data['rawHtml']
        
    return data

def change_tracking_response_transform(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Transform the change tracking data response from camelCase (API format) to snake_case.
    """
    # Handle nested changeTracking object
    if 'changeTracking' in data and isinstance(data['changeTracking'], dict):
        change_tracking = data['changeTracking']
        transformed_change_tracking = {}
        
        # Transform all camelCase fields to snake_case
        if 'previousScrapeAt' in change_tracking:
            transformed_change_tracking['previous_scrape_at'] = change_tracking['previousScrapeAt']
        
        if 'changeStatus' in change_tracking:
            transformed_change_tracking['change_status'] = change_tracking['changeStatus']
        
        if 'visibility' in change_tracking:
            transformed_change_tracking['visibility'] = change_tracking['visibility']
        
        if 'diff' in change_tracking:
            transformed_change_tracking['diff'] = change_tracking['diff']
        
        if 'json' in change_tracking:
            transformed_change_tracking['json'] = change_tracking['json']
        
        # Replace the camelCase changeTracking with snake_case change_tracking
        data['change_tracking'] = transformed_change_tracking
        del data['changeTracking']
    
    # Handle top-level fields (for backward compatibility)
    if 'changeStatus' in data:
        data['change_status'] = data['changeStatus']
        del data['changeStatus']

    if 'previousScrapeAt' in data:
        data['previous_scrape_at'] = data['previousScrapeAt']
        del data['previousScrapeAt']

    return data