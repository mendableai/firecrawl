"""
Search functionality for Firecrawl v2 API.
"""

from typing import Optional, Dict, Any, Union
from ...types import SearchRequest, SearchResponse, SearchResult, Document
from ..utils.http_client import HttpClient
from ..utils.error_handler import handle_response_error


def search(
    client: HttpClient,
    request: SearchRequest
) -> SearchResponse:
    """
    Search for documents.
    
    Args:
        client: HTTP client instance
        request: Search request
        
    Returns:
        SearchResponse containing the search results
        
    Raises:
        FirecrawlError: If the search operation fails
    """
    request_data = _prepare_search_request(request)
    
    response = client.post("/v2/search", request_data)
    
    if not response.ok:
        handle_response_error(response, "search")
    
    response_data = response.json()
    
    if response_data.get("success"):
        data = response_data.get("data", {})
        grouped_results = {}
        
        for source_type, source_documents in data.items():
            if isinstance(source_documents, list):
                results = []
                for doc_data in source_documents:
                    if isinstance(doc_data, dict):
                        if any(key in doc_data for key in ['markdown', 'html', 'content', 'screenshot']):
                            results.append(Document(**doc_data))
                        else:
                            results.append(SearchResult(
                                url=doc_data.get('url', ''),
                                title=doc_data.get('title'),
                                description=doc_data.get('description')
                            ))
                    elif isinstance(doc_data, str):
                        results.append(SearchResult(url=doc_data))
                grouped_results[source_type] = results
        
        return SearchResponse(
            success=True,
            data=grouped_results,
            warning=response_data.get("warning")
        )
    else:
        return SearchResponse(
            success=False,
            error=response_data.get("error", "Unknown error occurred")
        )


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
    # Validate timeout if present
    if request.timeout is not None and request.timeout <= 0:
        raise ValueError("Timeout must be positive")
    
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
    return validated_request.model_dump(exclude_none=True, by_alias=True)