"""
FirecrawlApp Module

This module provides a class `FirecrawlApp` for interacting with the Firecrawl API.
It includes methods to scrape URLs, perform searches, initiate and monitor crawl jobs,
and check the status of these jobs. The module uses requests for HTTP communication
and handles retries for certain HTTP status codes.

Classes:
    - FirecrawlApp: Main class for interacting with the Firecrawl API.
"""
import logging
import os
import time
from typing import Any, Dict, Optional

import requests

logger : logging.Logger = logging.getLogger("firecrawl")

class FirecrawlApp:
    """
    Initialize the FirecrawlApp instance.

    Args:
        api_key (Optional[str]): API key for authenticating with the Firecrawl API.
        api_url (Optional[str]): Base URL for the Firecrawl API.
    """
    def __init__(self, api_key: Optional[str] = None, api_url: Optional[str] = None) -> None:
        self.api_key = api_key or os.getenv('FIRECRAWL_API_KEY')
        if self.api_key is None:
            logger.warning("No API key provided")
            raise ValueError('No API key provided')
        else:
            logger.debug("Initialized FirecrawlApp with API key: %s", self.api_key)

        self.api_url = api_url or os.getenv('FIRECRAWL_API_URL', 'https://api.firecrawl.dev')
        if self.api_url != 'https://api.firecrawl.dev':
            logger.debug("Initialized FirecrawlApp with API URL: %s", self.api_url)

    def scrape_url(self, url: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """
        Scrape the specified URL using the Firecrawl API.

        Args:
            url (str): The URL to scrape.
            params (Optional[Dict[str, Any]]): Additional parameters for the scrape request.

        Returns:
            Any: The scraped data if the request is successful.

        Raises:
            Exception: If the scrape request fails.
        """

        headers = self._prepare_headers()

        # Prepare the base scrape parameters with the URL
        scrape_params = {'url': url}

        # If there are additional params, process them
        if params:
            # Initialize extractorOptions if present
            extractor_options = params.get('extractorOptions', {})
            # Check and convert the extractionSchema if it's a Pydantic model
            if 'extractionSchema' in extractor_options:
                if hasattr(extractor_options['extractionSchema'], 'schema'):
                    extractor_options['extractionSchema'] = extractor_options['extractionSchema'].schema()
                # Ensure 'mode' is set, defaulting to 'llm-extraction' if not explicitly provided
                extractor_options['mode'] = extractor_options.get('mode', 'llm-extraction')
                # Update the scrape_params with the processed extractorOptions
                scrape_params['extractorOptions'] = extractor_options

            # Include any other params directly at the top level of scrape_params
            for key, value in params.items():
                if key != 'extractorOptions':
                    scrape_params[key] = value
        # Make the POST request with the prepared headers and JSON data
        response = requests.post(
            f'{self.api_url}/v0/scrape',
            headers=headers,
            json=scrape_params,
        )
        if response.status_code == 200:
            response = response.json()
            if response['success'] and 'data' in response:
                return response['data']
            else:
                raise Exception(f'Failed to scrape URL. Error: {response["error"]}')
        else:
            self._handle_error(response, 'scrape URL')

    def search(self, query: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """
        Perform a search using the Firecrawl API.

        Args:
            query (str): The search query.
            params (Optional[Dict[str, Any]]): Additional parameters for the search request.

        Returns:
            Any: The search results if the request is successful.

        Raises:
            Exception: If the search request fails.
        """
        headers = self._prepare_headers()
        json_data = {'query': query}
        if params:
            json_data.update(params)
        response = requests.post(
            f'{self.api_url}/v0/search',
            headers=headers,
            json=json_data
        )
        if response.status_code == 200:
            response = response.json()

            if response['success'] and 'data' in response:
                return response['data']
            else:
                raise Exception(f'Failed to search. Error: {response["error"]}')

        else:
            self._handle_error(response, 'search')

    def crawl_url(self, url: str,
                  params: Optional[Dict[str, Any]] = None,
                  wait_until_done: bool = True,
                  poll_interval: int = 2,
                  idempotency_key: Optional[str] = None) -> Any:
        """
        Initiate a crawl job for the specified URL using the Firecrawl API.

        Args:
            url (str): The URL to crawl.
            params (Optional[Dict[str, Any]]): Additional parameters for the crawl request.
            wait_until_done (bool): Whether to wait until the crawl job is completed.
            poll_interval (int): Time in seconds between status checks when waiting for job completion.
            idempotency_key (Optional[str]): A unique uuid key to ensure idempotency of requests.

        Returns:
            Any: The crawl job ID or the crawl results if waiting until completion.

        Raises:
            Exception: If the crawl job initiation or monitoring fails.
        """
        headers = self._prepare_headers(idempotency_key)
        json_data = {'url': url}
        if params:
            json_data.update(params)
        response = self._post_request(f'{self.api_url}/v0/crawl', json_data, headers)
        if response.status_code == 200:
            job_id = response.json().get('jobId')
            if wait_until_done:
                return self._monitor_job_status(job_id, headers, poll_interval)
            else:
                return {'jobId': job_id}
        else:
            self._handle_error(response, 'start crawl job')

    def check_crawl_status(self, job_id: str) -> Any:
        """
        Check the status of a crawl job using the Firecrawl API.

        Args:
            job_id (str): The ID of the crawl job.

        Returns:
            Any: The status of the crawl job.

        Raises:
            Exception: If the status check request fails.
        """
        headers = self._prepare_headers()
        response = self._get_request(f'{self.api_url}/v0/crawl/status/{job_id}', headers)
        if response.status_code == 200:
            return response.json()
        else:
            self._handle_error(response, 'check crawl status')

    def _prepare_headers(self, idempotency_key: Optional[str] = None) -> Dict[str, str]:
        """
        Prepare the headers for API requests.

        Args:
            idempotency_key (Optional[str]): A unique key to ensure idempotency of requests.

        Returns:
            Dict[str, str]: The headers including content type, authorization, and optionally idempotency key.
        """
        if idempotency_key:
            return {
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {self.api_key}',
                'x-idempotency-key': idempotency_key
            }

        return {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.api_key}',
        }

    def _post_request(self, url: str,
                      data: Dict[str, Any],
                      headers: Dict[str, str],
                      retries: int = 3,
                      backoff_factor: float = 0.5) -> requests.Response:
        """
        Make a POST request with retries.

        Args:
            url (str): The URL to send the POST request to.
            data (Dict[str, Any]): The JSON data to include in the POST request.
            headers (Dict[str, str]): The headers to include in the POST request.
            retries (int): Number of retries for the request.
            backoff_factor (float): Backoff factor for retries.

        Returns:
            requests.Response: The response from the POST request.

        Raises:
            requests.RequestException: If the request fails after the specified retries.
        """
        for attempt in range(retries):
            response = requests.post(url, headers=headers, json=data)
            if response.status_code == 502:
                time.sleep(backoff_factor * (2 ** attempt))
            else:
                return response
        return response

    def _get_request(self, url: str,
                     headers: Dict[str, str],
                     retries: int = 3,
                     backoff_factor: float = 0.5) -> requests.Response:
        """
        Make a GET request with retries.

        Args:
            url (str): The URL to send the GET request to.
            headers (Dict[str, str]): The headers to include in the GET request.
            retries (int): Number of retries for the request.
            backoff_factor (float): Backoff factor for retries.

        Returns:
            requests.Response: The response from the GET request.

        Raises:
            requests.RequestException: If the request fails after the specified retries.
        """
        for attempt in range(retries):
            response = requests.get(url, headers=headers)
            if response.status_code == 502:
                time.sleep(backoff_factor * (2 ** attempt))
            else:
                return response
        return response

    def _monitor_job_status(self, job_id: str, headers: Dict[str, str], poll_interval: int) -> Any:
        """
        Monitor the status of a crawl job until completion.

        Args:
            job_id (str): The ID of the crawl job.
            headers (Dict[str, str]): The headers to include in the status check requests.
            poll_interval (int): Secounds between status checks.

        Returns:
            Any: The crawl results if the job is completed successfully.

        Raises:
            Exception: If the job fails or an error occurs during status checks.
        """
        while True:
            status_response = self._get_request(f'{self.api_url}/v0/crawl/status/{job_id}', headers)
            if status_response.status_code == 200:
                status_data = status_response.json()
                if status_data['status'] == 'completed':
                    if 'data' in status_data:
                        return status_data['data']
                    else:
                        raise Exception('Crawl job completed but no data was returned')
                elif status_data['status'] in ['active', 'paused', 'pending', 'queued', 'waiting']:
                    poll_interval=max(poll_interval,2)
                    time.sleep(poll_interval)  # Wait for the specified interval before checking again
                else:
                    raise Exception(f'Crawl job failed or was stopped. Status: {status_data["status"]}')
            else:
                self._handle_error(status_response, 'check crawl status')

    def _handle_error(self, response: requests.Response, action: str) -> None:
        """
        Handle errors from API responses.

        Args:
            response (requests.Response): The response object from the API request.
            action (str): Description of the action that was being performed.

        Raises:
            Exception: An exception with a message containing the status code and error details from the response.
        """
        error_message = response.json().get('error', 'No additional error details provided.')

        if response.status_code == 402:
            message = f"Payment Required: Failed to {action}. {error_message}"
        elif response.status_code == 408:
            message = f"Request Timeout: Failed to {action} as the request timed out. {error_message}"
        elif response.status_code == 409:
            message = f"Conflict: Failed to {action} due to a conflict. {error_message}"
        elif response.status_code == 500:
            message = f"Internal Server Error: Failed to {action}. {error_message}"
        else:
            message = f"Unexpected error during {action}: Status code {response.status_code}. {error_message}"

        # Raise an HTTPError with the custom message and attach the response
        raise requests.exceptions.HTTPError(message, response=response)
    