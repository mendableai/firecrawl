"""
Search functionality for Firecrawl v2 API.
"""

from typing import Optional, Dict, Any, Union
from ..types import SearchRequest, SearchData, SearchResult, Document
from ..utils import HttpClient, handle_response_error, validate_scrape_options, prepare_scrape_options


def search(
    client: HttpClient,
    request: SearchRequest
) -> SearchData:
    """
    Search for documents.
    
    Args:
        client: HTTP client instance
        request: Search request
        
    Returns:
        SearchData with search results grouped by source type
        
    Raises:
        FirecrawlError: If the search operation fails
    """
    request_data = _prepare_search_request(request)
    
    response = client.post("/v2/search", request_data)
    
    if not response.ok:
        handle_response_error(response, "search")
    
    response_data = response.json()
    
    if not response_data.get("success"):
        # Handle error case
        error_msg = response_data.get("error", "Unknown error occurred")
        raise Exception(f"Search failed: {error_msg}")
    
    data = response_data.get("data", {})
    search_data = SearchData()
    
    for source_type, source_documents in data.items():
        if isinstance(source_documents, list):
            results = []
            for doc_data in source_documents:
                if isinstance(doc_data, dict):
                    # If page scraping options were provided, API returns full Document objects
                    if request.scrape_options is not None and any(
                        key in doc_data for key in ['markdown', 'html', 'rawHtml', 'links', 'summary', 'screenshot', 'changeTracking']
                    ):
                        # Normalize keys for Document (no Pydantic aliases)
                        normalized = dict(doc_data)
                        if 'rawHtml' in normalized and 'raw_html' not in normalized:
                            normalized['raw_html'] = normalized.pop('rawHtml')
                        if 'changeTracking' in normalized and 'change_tracking' not in normalized:
                            normalized['change_tracking'] = normalized.pop('changeTracking')
                        results.append(Document(**normalized))
                    else:
                        # Minimal search result shape
                        results.append(SearchResult(
                            url=doc_data.get('url', ''),
                            title=doc_data.get('title'),
                            description=doc_data.get('description')
                        ))
                elif isinstance(doc_data, str):
                    results.append(SearchResult(url=doc_data))

            if hasattr(search_data, source_type):
                setattr(search_data, source_type, results)
    
    return search_data


def _validate_search_request(request: SearchRequest) -> SearchRequest:
    """
    Validate and normalize search request.
    
    Args:
        request: Search request to validate
        
    Returns:
        Validated request
        
    Raises:
        ValueError: If request is invalid
    """
    # Validate query
    if not request.query or not request.query.strip():
        raise ValueError("Query cannot be empty")
    
    # Validate limit
    if request.limit is not None:
        if request.limit <= 0:
            raise ValueError("Limit must be positive")
        if request.limit > 100:
            raise ValueError("Limit cannot exceed 100")
    
    # Validate timeout
    if request.timeout is not None:
        if request.timeout <= 0:
            raise ValueError("Timeout must be positive")
        if request.timeout > 300000:  # 5 minutes max
            raise ValueError("Timeout cannot exceed 300000ms (5 minutes)")
    
    # Validate sources (if provided)
    if request.sources is not None:
        valid_sources = {"web", "news", "images"}
        for source in request.sources:
            if isinstance(source, str):
                if source not in valid_sources:
                    raise ValueError(f"Invalid source type: {source}. Valid types: {valid_sources}")
            elif hasattr(source, 'type'):
                if source.type not in valid_sources:
                    raise ValueError(f"Invalid source type: {source.type}. Valid types: {valid_sources}")
    
    # Validate location (if provided)
    if request.location is not None:
        if not isinstance(request.location, str) or len(request.location.strip()) == 0:
            raise ValueError("Location must be a non-empty string")
    
    # Validate tbs (time-based search, if provided)
    if request.tbs is not None:
        valid_tbs_values = {
            "qdr:d", "qdr:w", "qdr:m", "qdr:y",  # Google time filters
            "d", "w", "m", "y"  # Short forms
        }
        if request.tbs not in valid_tbs_values:
            raise ValueError(f"Invalid tbs value: {request.tbs}. Valid values: {valid_tbs_values}")
    
    # Validate scrape_options (if provided)
    if request.scrape_options is not None:
        validate_scrape_options(request.scrape_options)
    
    return request


def _prepare_search_request(request: SearchRequest) -> Dict[str, Any]:
    """
    Prepare a search request payload.
    
    Args:
        request: Search request
        
    Returns:
        Request payload dictionary
    """
    validated_request = _validate_search_request(request)
    data = validated_request.model_dump(exclude_none=True, by_alias=True)
    
    # Ensure default values are included only if not explicitly set to None
    if "limit" not in data and validated_request.limit is not None:
        data["limit"] = validated_request.limit
    if "timeout" not in data and validated_request.timeout is not None:
        data["timeout"] = validated_request.timeout
    
    # Handle snake_case to camelCase conversions manually
    # (Pydantic Field() aliases interfere with value assignment)
    
    # ignore_invalid_urls → ignoreInvalidURLs
    if validated_request.ignore_invalid_urls is not None:
        data["ignoreInvalidURLs"] = validated_request.ignore_invalid_urls
        data.pop("ignore_invalid_urls", None)
    
    # scrape_options → scrapeOptions
    if validated_request.scrape_options is not None:
        scrape_data = prepare_scrape_options(validated_request.scrape_options)
        if scrape_data:
            data["scrapeOptions"] = scrape_data
        data.pop("scrape_options", None)
    
    return data