"""
Crawling functionality for Firecrawl v2 API.
"""

import time
from typing import Optional, Callable, Generator
from .types import (
    CrawlRequest, CrawlResponse, CrawlStatusResponse, CrawlOptions,
    CrawlJob, CrawlStatusData, Document
)
from .utils.http_client import HttpClient
from .utils.error_handler import handle_response_error


def start_crawl(
    client: HttpClient,
    url: str,
    options: Optional[CrawlOptions] = None
) -> CrawlResponse:
    """
    Start a crawl job for a website.
    
    Args:
        client: HTTP client instance
        url: URL to crawl
        options: Crawling options
        
    Returns:
        CrawlResponse containing job information
        
    Raises:
        FirecrawlError: If the crawl operation fails to start
    """
    # Prepare request data
    request_data = {"url": url}
    
    if options:
        request_data.update(options.dict(exclude_none=True, by_alias=True))
    
    # Make the API request
    response = client.post("/v1/crawl", request_data)
    
    # Handle errors
    if not response.ok:
        handle_response_error(response, "start crawl")
    
    # Parse response
    response_data = response.json()
    
    if response_data.get("success"):
        job_data = response_data.get("data", {})
        job = CrawlJob(**job_data)
        
        return CrawlResponse(
            success=True,
            data=job,
            warning=response_data.get("warning")
        )
    else:
        return CrawlResponse(
            success=False,
            error=response_data.get("error", "Unknown error occurred")
        )


def get_crawl_status(
    client: HttpClient,
    job_id: str
) -> CrawlStatusResponse:
    """
    Get the status of a crawl job.
    
    Args:
        client: HTTP client instance
        job_id: ID of the crawl job
        
    Returns:
        CrawlStatusResponse containing job status and data
        
    Raises:
        FirecrawlError: If the status check fails
    """
    # Make the API request
    response = client.get(f"/v1/crawl/{job_id}")
    
    # Handle errors
    if not response.ok:
        handle_response_error(response, "get crawl status")
    
    # Parse response
    response_data = response.json()
    
    if response_data.get("success"):
        status_data = response_data.get("data", {})
        
        # Convert documents
        documents = []
        if "data" in status_data:
            for doc_data in status_data["data"]:
                documents.append(Document(**doc_data))
        
        # Convert partial data if present
        partial_documents = []
        if "partialData" in status_data:
            for doc_data in status_data["partialData"]:
                partial_documents.append(Document(**doc_data))
        
        crawl_status = CrawlStatusData(
            status=status_data.get("status"),
            current=status_data.get("current", 0),
            total=status_data.get("total", 0),
            data=documents,
            partial_data=partial_documents if partial_documents else None
        )
        
        return CrawlStatusResponse(
            success=True,
            data=crawl_status,
            warning=response_data.get("warning")
        )
    else:
        return CrawlStatusResponse(
            success=False,
            error=response_data.get("error", "Unknown error occurred")
        )


def cancel_crawl(
    client: HttpClient,
    job_id: str
) -> CrawlStatusResponse:
    """
    Cancel a running crawl job.
    
    Args:
        client: HTTP client instance
        job_id: ID of the crawl job to cancel
        
    Returns:
        CrawlStatusResponse with updated status
        
    Raises:
        FirecrawlError: If the cancellation fails
    """
    # Make the API request
    response = client.delete(f"/v1/crawl/{job_id}")
    
    # Handle errors
    if not response.ok:
        handle_response_error(response, "cancel crawl")
    
    # Parse response
    response_data = response.json()
    
    if response_data.get("success"):
        status_data = response_data.get("data", {})
        
        crawl_status = CrawlStatusData(
            status=status_data.get("status", "cancelled"),
            current=status_data.get("current", 0),
            total=status_data.get("total", 0),
            data=[]
        )
        
        return CrawlStatusResponse(
            success=True,
            data=crawl_status,
            warning=response_data.get("warning")
        )
    else:
        return CrawlStatusResponse(
            success=False,
            error=response_data.get("error", "Unknown error occurred")
        )


def wait_for_crawl_completion(
    client: HttpClient,
    job_id: str,
    poll_interval: int = 2,
    timeout: Optional[int] = None,
    progress_callback: Optional[Callable[[CrawlStatusData], None]] = None
) -> CrawlStatusResponse:
    """
    Wait for a crawl job to complete, polling for status updates.
    
    Args:
        client: HTTP client instance
        job_id: ID of the crawl job
        poll_interval: Seconds between status checks
        timeout: Maximum seconds to wait (None for no timeout)
        progress_callback: Optional callback for progress updates
        
    Returns:
        CrawlStatusResponse when job completes
        
    Raises:
        FirecrawlError: If the job fails or timeout is reached
        TimeoutError: If timeout is reached
    """
    start_time = time.time()
    
    while True:
        status_response = get_crawl_status(client, job_id)
        
        if not status_response.success:
            return status_response
        
        status_data = status_response.data
        
        # Call progress callback if provided
        if progress_callback and status_data:
            progress_callback(status_data)
        
        # Check if job is complete
        if status_data and status_data.status in ["completed", "failed", "cancelled"]:
            return status_response
        
        # Check timeout
        if timeout and (time.time() - start_time) > timeout:
            raise TimeoutError(f"Crawl job {job_id} did not complete within {timeout} seconds")
        
        # Wait before next poll
        time.sleep(poll_interval)


def crawl_and_wait(
    client: HttpClient,
    url: str,
    options: Optional[CrawlOptions] = None,
    poll_interval: int = 2,
    timeout: Optional[int] = None,
    progress_callback: Optional[Callable[[CrawlStatusData], None]] = None
) -> CrawlStatusResponse:
    """
    Start a crawl job and wait for it to complete.
    
    Args:
        client: HTTP client instance
        url: URL to crawl
        options: Crawling options
        poll_interval: Seconds between status checks
        timeout: Maximum seconds to wait (None for no timeout)
        progress_callback: Optional callback for progress updates
        
    Returns:
        CrawlStatusResponse when job completes
        
    Raises:
        FirecrawlError: If the crawl fails to start or complete
        TimeoutError: If timeout is reached
    """
    # Start the crawl
    crawl_response = start_crawl(client, url, options)
    
    if not crawl_response.success or not crawl_response.data:
        return CrawlStatusResponse(
            success=False,
            error=crawl_response.error or "Failed to start crawl"
        )
    
    job_id = crawl_response.data.id
    
    # Wait for completion
    return wait_for_crawl_completion(
        client, job_id, poll_interval, timeout, progress_callback
    )


def stream_crawl_results(
    client: HttpClient,
    job_id: str,
    poll_interval: int = 2
) -> Generator[Document, None, None]:
    """
    Stream crawl results as they become available.
    
    Args:
        client: HTTP client instance
        job_id: ID of the crawl job
        poll_interval: Seconds between status checks
        
    Yields:
        Document objects as they are crawled
        
    Raises:
        FirecrawlError: If the job fails
    """
    seen_count = 0
    
    while True:
        status_response = get_crawl_status(client, job_id)
        
        if not status_response.success:
            raise Exception(f"Failed to get crawl status: {status_response.error}")
        
        status_data = status_response.data
        if not status_data:
            break
        
        # Yield new documents
        if status_data.data:
            for i in range(seen_count, len(status_data.data)):
                yield status_data.data[i]
            seen_count = len(status_data.data)
        
        # Check if job is complete
        if status_data.status in ["completed", "failed", "cancelled"]:
            break
        
        # Wait before next poll
        time.sleep(poll_interval)


def validate_crawl_options(options: Optional[CrawlOptions]) -> Optional[CrawlOptions]:
    """
    Validate and normalize crawl options.
    
    Args:
        options: Crawling options to validate
        
    Returns:
        Validated options or None
        
    Raises:
        ValueError: If options are invalid
    """
    if options is None:
        return None
    
    # Validate limit
    if options.limit is not None and options.limit <= 0:
        raise ValueError("Limit must be positive")
    
    # Validate max_depth
    if options.max_depth is not None and options.max_depth < 0:
        raise ValueError("max_depth must be non-negative")
    
    return options


def prepare_crawl_request(url: str, options: Optional[CrawlOptions] = None) -> dict:
    """
    Prepare a crawl request payload.
    
    Args:
        url: URL to crawl
        options: Crawling options
        
    Returns:
        Request payload dictionary
    """
    request_data = {"url": url}
    
    if options:
        validated_options = validate_crawl_options(options)
        if validated_options:
            request_data.update(validated_options.dict(exclude_none=True, by_alias=True))
    
    return request_data