"""
Batch scraping functionality for Firecrawl v2 API.
"""

import time
from typing import Optional, List, Callable
from .types import (
    BatchScrapeRequest, BatchScrapeResponse,
    BatchScrapeJob, BatchScrapeData, ScrapeOptions, Document
)
from .utils import HttpClient, handle_response_error, validate_scrape_options, prepare_scrape_options


def start_batch_scrape(
    client: HttpClient,
    urls: List[str],
    options: Optional[ScrapeOptions] = None
) -> BatchScrapeResponse:
    """
    Start a batch scrape job for multiple URLs.
    
    Args:
        client: HTTP client instance
        urls: List of URLs to scrape
        options: Scraping options
        
    Returns:
        BatchScrapeResponse containing job information
        
    Raises:
        FirecrawlError: If the batch scrape operation fails to start
    """
    # Prepare request data
    request_data = prepare_batch_request(urls, options)
    
    # Make the API request
    response = client.post("/v1/batch/scrape", request_data)
    
    # Handle errors
    if not response.ok:
        handle_response_error(response, "start batch scrape")
    
    # Parse response
    response_data = response.json()
    
    if response_data.get("success"):
        job_data = response_data.get("data", {})
        job = BatchScrapeJob(**job_data)
        
        return BatchScrapeResponse(
            success=True,
            data=job,
            warning=response_data.get("warning")
        )
    else:
        return BatchScrapeResponse(
            success=False,
            error=response_data.get("error", "Unknown error occurred")
        )


def get_batch_scrape_status(
    client: HttpClient,
    job_id: str
) -> BatchScrapeResponse:
    """
    Get the status of a batch scrape job.
    
    Args:
        client: HTTP client instance
        job_id: ID of the batch scrape job
        
    Returns:
        BatchScrapeStatusResponse containing job status and data
        
    Raises:
        FirecrawlError: If the status check fails
    """
    # Make the API request
    response = client.get(f"/v1/batch/scrape/{job_id}")
    
    # Handle errors
    if not response.ok:
        handle_response_error(response, "get batch scrape status")
    
    # Parse response
    response_data = response.json()
    
    if response_data.get("success"):
        status_data = response_data.get("data", {})
        
        # Convert documents
        documents = []
        if "data" in status_data:
            for doc_data in status_data["data"]:
                documents.append(Document(**doc_data))
        
        batch_data = BatchScrapeData(
            status=status_data.get("status"),
            current=status_data.get("current", 0),
            total=status_data.get("total", 0),
            data=documents
        )
        
        return BatchScrapeResponse(
            success=True,
            data=batch_data,
            warning=response_data.get("warning")
        )
    else:
        return BatchScrapeResponse(
            success=False,
            error=response_data.get("error", "Unknown error occurred")
        )


def cancel_batch_scrape(
    client: HttpClient,
    job_id: str
) -> BatchScrapeResponse:
    """
    Cancel a running batch scrape job.
    
    Args:
        client: HTTP client instance
        job_id: ID of the batch scrape job to cancel
        
    Returns:
        BatchScrapeStatusResponse with updated status
        
    Raises:
        FirecrawlError: If the cancellation fails
    """
    # Make the API request
    response = client.delete(f"/v1/batch/scrape/{job_id}")
    
    # Handle errors
    if not response.ok:
        handle_response_error(response, "cancel batch scrape")
    
    # Parse response
    response_data = response.json()
    
    if response_data.get("success"):
        status_data = response_data.get("data", {})
        
        batch_data = BatchScrapeData(
            status=status_data.get("status", "cancelled"),
            current=status_data.get("current", 0),
            total=status_data.get("total", 0),
            data=[]
        )
        
        return BatchScrapeResponse(
            success=True,
            data=batch_data,
            warning=response_data.get("warning")
        )
    else:
        return BatchScrapeResponse(
            success=False,
            error=response_data.get("error", "Unknown error occurred")
        )


def wait_for_batch_completion(
    client: HttpClient,
    job_id: str,
    poll_interval: int = 2,
    timeout: Optional[int] = None
) -> BatchScrapeResponse:
    """
    Wait for a batch scrape job to complete, polling for status updates.
    
    Args:
        client: HTTP client instance
        job_id: ID of the batch scrape job
        poll_interval: Seconds between status checks
        timeout: Maximum seconds to wait (None for no timeout)
        
    Returns:
        BatchScrapeStatusResponse when job completes
        
    Raises:
        FirecrawlError: If the job fails or timeout is reached
        TimeoutError: If timeout is reached
    """
    start_time = time.time()
    
    while True:
        status_response = get_batch_scrape_status(client, job_id)
        
        if not status_response.success:
            return status_response
        
        status_data = status_response.data
        
        # Check if job is complete
        if status_data and status_data.status in ["completed", "failed", "cancelled"]:
            return status_response
        
        # Check timeout
        if timeout and (time.time() - start_time) > timeout:
            raise TimeoutError(f"Batch scrape job {job_id} did not complete within {timeout} seconds")
        
        # Wait before next poll
        time.sleep(poll_interval)


def batch_scrape_and_wait(
    client: HttpClient,
    urls: List[str],
    options: Optional[ScrapeOptions] = None,
    poll_interval: int = 2,
    timeout: Optional[int] = None
) -> BatchScrapeResponse:
    """
    Start a batch scrape job and wait for it to complete.
    
    Args:
        client: HTTP client instance
        urls: List of URLs to scrape
        options: Scraping options
        poll_interval: Seconds between status checks
        timeout: Maximum seconds to wait (None for no timeout)
        
    Returns:
        BatchScrapeStatusResponse when job completes
        
    Raises:
        FirecrawlError: If the batch scrape fails to start or complete
        TimeoutError: If timeout is reached
    """
    # Start the batch scrape
    batch_response = start_batch_scrape(client, urls, options)
    
    if not batch_response.success or not batch_response.data:
        return BatchScrapeStatusResponse(
            success=False,
            error=batch_response.error or "Failed to start batch scrape"
        )
    
    job_id = batch_response.data.id
    
    # Wait for completion
    return wait_for_batch_completion(
        client, job_id, poll_interval, timeout
    )


def validate_batch_urls(urls: List[str]) -> List[str]:
    """
    Validate and normalize a list of URLs for batch scraping.
    
    Args:
        urls: List of URLs to validate
        
    Returns:
        Validated list of URLs
        
    Raises:
        ValueError: If URLs are invalid
    """
    if not urls:
        raise ValueError("URLs list cannot be empty")
    
    if len(urls) > 1000:  # Assuming API limit
        raise ValueError("Too many URLs (maximum 1000)")
    
    validated_urls = []
    for url in urls:
        if not url or not isinstance(url, str):
            raise ValueError(f"Invalid URL: {url}")
        
        # Basic URL validation
        if not (url.startswith("http://") or url.startswith("https://")):
            raise ValueError(f"URL must start with http:// or https://: {url}")
        
        validated_urls.append(url.strip())
    
    return validated_urls


def prepare_batch_request(urls: List[str], options: Optional[ScrapeOptions] = None) -> dict:
    """
    Prepare a batch scrape request payload.
    
    Args:
        urls: List of URLs to scrape
        options: Scraping options
        
    Returns:
        Request payload dictionary
    """
    validated_urls = validate_batch_urls(urls)
    request_data = {"urls": validated_urls}
    
    if options:
        # Use shared function for ScrapeOptions preparation
        scrape_data = prepare_scrape_options(options)
        if scrape_data:
            request_data["pageOptions"] = scrape_data
    
    return request_data


def chunk_urls(urls: List[str], chunk_size: int = 100) -> List[List[str]]:
    """
    Split a large list of URLs into smaller chunks for batch processing.
    
    Args:
        urls: List of URLs to chunk
        chunk_size: Maximum size of each chunk
        
    Returns:
        List of URL chunks
    """
    chunks = []
    for i in range(0, len(urls), chunk_size):
        chunks.append(urls[i:i + chunk_size])
    return chunks


def process_large_batch(
    client: HttpClient,
    urls: List[str],
    options: Optional[ScrapeOptions] = None,
    chunk_size: int = 100,
    poll_interval: int = 2,
    timeout: Optional[int] = None
) -> List[Document]:
    """
    Process a large batch of URLs by splitting into smaller chunks.
    
    Args:
        client: HTTP client instance
        urls: List of URLs to scrape
        options: Scraping options
        chunk_size: Size of each batch chunk
        poll_interval: Seconds between status checks
        timeout: Maximum seconds to wait per chunk
        
    Returns:
        List of all scraped documents
        
    Raises:
        FirecrawlError: If any chunk fails
    """
    url_chunks = chunk_urls(urls, chunk_size)
    all_documents = []
    completed_chunks = 0
    
    for chunk in url_chunks:
        # Process this chunk
        result = batch_scrape_and_wait(
            client, chunk, options, poll_interval, timeout
        )
        
        if not result.success or not result.data:
            raise Exception(f"Failed to process chunk: {result.error}")
        
        # Add documents from this chunk
        if result.data.data:
            all_documents.extend(result.data.data)
        
        completed_chunks += 1
    
    return all_documents