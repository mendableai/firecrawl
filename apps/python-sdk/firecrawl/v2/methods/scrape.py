"""
Scraping functionality for Firecrawl v2 API.
"""

import json
from typing import Optional, Dict, Any
from .types import ScrapeRequest, ScrapeResponse, ScrapeOptions, Document
from .utils import HttpClient, handle_response_error, validate_scrape_options


def scrape(
    client: HttpClient,
    url: str,
    options: Optional[ScrapeOptions] = None
) -> ScrapeResponse:
    """
    Scrape a single URL and return the content.
    
    Args:
        client: HTTP client instance
        url: URL to scrape
        options: Scraping options
        
    Returns:
        ScrapeResponse containing the scraped document
        
    Raises:
        FirecrawlError: If the scraping operation fails
    """
    # Prepare request data
    request_data = {"url": url}
    
    if options:
        request_data["options"] = options.dict(exclude_none=True, by_alias=True)
    
    # Make the API request
    response = client.post("/v1/scrape", request_data)
    
    # Handle errors
    if not response.ok:
        handle_response_error(response, "scrape URL")
    
    # Parse response
    response_data = response.json()
    
    # Create document from response
    if response_data.get("success"):
        document_data = response_data.get("data", {})
        document = Document(**document_data)
        
        return ScrapeResponse(
            success=True,
            data=document,
            warning=response_data.get("warning")
        )
    else:
        return ScrapeResponse(
            success=False,
            error=response_data.get("error", "Unknown error occurred")
        )


def scrape_with_extract(
    client: HttpClient,
    url: str,
    schema: Dict[str, Any],
    options: Optional[ScrapeOptions] = None,
    system_prompt: Optional[str] = None,
    prompt: Optional[str] = None
) -> ScrapeResponse:
    """
    Scrape a URL and extract structured data using a schema.
    
    Args:
        client: HTTP client instance
        url: URL to scrape
        schema: JSON schema for data extraction
        options: Scraping options
        system_prompt: System prompt for extraction
        prompt: User prompt for extraction
        
    Returns:
        ScrapeResponse with extracted data
        
    Raises:
        FirecrawlError: If the operation fails
    """
    # Prepare request data
    request_data = {
        "url": url,
        "extractorOptions": {
            "extractionSchema": schema
        }
    }
    
    if system_prompt:
        request_data["extractorOptions"]["extractionPrompt"] = system_prompt
    
    if prompt:
        request_data["extractorOptions"]["userPrompt"] = prompt
    
    if options:
        request_data["pageOptions"] = options.dict(exclude_none=True, by_alias=True)
    
    # Make the API request
    response = client.post("/v1/scrape", request_data)
    
    # Handle errors
    if not response.ok:
        handle_response_error(response, "scrape and extract from URL")
    
    # Parse response
    response_data = response.json()
    
    # Create document from response
    if response_data.get("success"):
        document_data = response_data.get("data", {})
        document = Document(**document_data)
        
        return ScrapeResponse(
            success=True,
            data=document,
            warning=response_data.get("warning")
        )
    else:
        return ScrapeResponse(
            success=False,
            error=response_data.get("error", "Unknown error occurred")
        )


def scrape_multiple(
    client: HttpClient,
    urls: list[str],
    options: Optional[ScrapeOptions] = None
) -> list[ScrapeResponse]:
    """
    Scrape multiple URLs concurrently.
    
    Args:
        client: HTTP client instance
        urls: List of URLs to scrape
        options: Scraping options
        
    Returns:
        List of ScrapeResponse objects
        
    Note:
        This function makes individual requests for each URL.
        For large batches, consider using batch_scrape instead.
    """
    results = []
    
    for url in urls:
        try:
            result = scrape(client, url, options)
            results.append(result)
        except Exception as e:
            # Create error response for failed scrapes
            error_response = ScrapeResponse(
                success=False,
                error=f"Failed to scrape {url}: {str(e)}"
            )
            results.append(error_response)
    
    return results





def prepare_scrape_request(url: str, options: Optional[ScrapeOptions] = None) -> Dict[str, Any]:
    """
    Prepare a scrape request payload.
    
    Args:
        url: URL to scrape
        options: Scraping options
        
    Returns:
        Request payload dictionary
    """
    request_data = {"url": url}
    
    if options:
        validated_options = validate_scrape_options(options)
        if validated_options:
            request_data["options"] = validated_options.dict(exclude_none=True, by_alias=True)
    
    return request_data