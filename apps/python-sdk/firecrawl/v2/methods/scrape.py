"""
Scraping functionality for Firecrawl v2 API.
"""

from typing import Optional, Dict, Any
from ..types import ScrapeOptions, Document
from ..utils import HttpClient, handle_response_error, prepare_scrape_options, validate_scrape_options


def _prepare_scrape_request(url: str, options: Optional[ScrapeOptions] = None) -> Dict[str, Any]:
    """
    Prepare a scrape request payload for v2 API.
    
    Args:
        url: URL to scrape
        options: ScrapeOptions (snake_case) to convert and include
        
    Returns:
        Request payload dictionary with camelCase fields
    """
    if not url or not url.strip():
        raise ValueError("URL cannot be empty")

    request_data: Dict[str, Any] = {"url": url.strip()}

    if options is not None:
        validated = validate_scrape_options(options)
        if validated is not None:
            opts = prepare_scrape_options(validated)
            if opts:
                request_data.update(opts)

    return request_data

def scrape(client: HttpClient, url: str, options: Optional[ScrapeOptions] = None) -> Document:
    """
    Scrape a single URL and return the document.
    
    The v2 API returns: { success: boolean, data: Document }
    We surface just the Document to callers.
    
    Args:
        client: HTTP client instance
        url: URL to scrape
        options: Scraping options (snake_case)
        
    Returns:
        Document
    """
    payload = _prepare_scrape_request(url, options)

    response = client.post("/v2/scrape", payload)

    if not response.ok:
        handle_response_error(response, "scrape")

    body = response.json()
    if not body.get("success"):
        raise Exception(body.get("error", "Unknown error occurred"))

    document_data = body.get("data", {})
    # Normalize keys for Document (no Pydantic aliases)
    normalized = dict(document_data)
    if 'rawHtml' in normalized and 'raw_html' not in normalized:
        normalized['raw_html'] = normalized.pop('rawHtml')
    if 'changeTracking' in normalized and 'change_tracking' not in normalized:
        normalized['change_tracking'] = normalized.pop('changeTracking')
    return Document(**normalized)