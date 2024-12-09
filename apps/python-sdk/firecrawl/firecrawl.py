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
from typing import Any, Dict, Optional, List, Union
import json

import requests
import pydantic
import websockets

logger : logging.Logger = logging.getLogger("firecrawl")

class FirecrawlApp:
    class ExtractParams(pydantic.BaseModel):
        """
        Parameters for the extract operation.
        """
        prompt: str
        schema_: Optional[Any] = pydantic.Field(None, alias='schema')
        system_prompt: Optional[str] = None
        allow_external_links: Optional[bool] = False

    class ExtractResponse(pydantic.BaseModel):
        """
        Response from the extract operation.
        """
        success: bool
        data: Optional[Any] = None
        error: Optional[str] = None

    def __init__(self, api_key: Optional[str] = None, api_url: Optional[str] = None) -> None:
      """
      Initialize the FirecrawlApp instance with API key, API URL.

      Args:
          api_key (Optional[str]): API key for authenticating with the Firecrawl API.
          api_url (Optional[str]): Base URL for the Firecrawl API.
      """
      self.api_key = api_key or os.getenv('FIRECRAWL_API_KEY')
      self.api_url = api_url or os.getenv('FIRECRAWL_API_URL', 'https://api.firecrawl.dev')
      if self.api_key is None:
          logger.warning("No API key provided")
          raise ValueError('No API key provided')
      logger.debug(f"Initialized FirecrawlApp with API key: {self.api_key}")

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
            # Handle extract (for v1)
            extract = params.get('extract', {})
            if extract:
                if 'schema' in extract and hasattr(extract['schema'], 'schema'):
                    extract['schema'] = extract['schema'].schema()
                scrape_params['extract'] = extract

            # Include any other params directly at the top level of scrape_params
            for key, value in params.items():
                if key not in ['extract']:
                    scrape_params[key] = value

        endpoint = f'/v1/scrape'
        # Make the POST request with the prepared headers and JSON data
        response = requests.post(
            f'{self.api_url}{endpoint}',
            headers=headers,
            json=scrape_params,
        )
        if response.status_code == 200:
            response = response.json()
            if response['success'] and 'data' in response:
                return response['data']
            elif "error" in response:
                raise Exception(f'Failed to scrape URL. Error: {response["error"]}')
            else:
                raise Exception(f'Failed to scrape URL. Error: {response}')
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
            NotImplementedError: If the search request is attempted on API version v1.
            Exception: If the search request fails.
        """
        raise NotImplementedError("Search is not supported in v1.")

    def crawl_url(self, url: str,
                  params: Optional[Dict[str, Any]] = None,
                  poll_interval: Optional[int] = 2,
                  idempotency_key: Optional[str] = None) -> Any:
        """
        Initiate a crawl job for the specified URL using the Firecrawl API.

        Args:
            url (str): The URL to crawl.
            params (Optional[Dict[str, Any]]): Additional parameters for the crawl request.
            poll_interval (Optional[int]): Time in seconds between status checks when waiting for job completion. Defaults to 2 seconds.
            idempotency_key (Optional[str]): A unique uuid key to ensure idempotency of requests.

        Returns:
            Dict[str, Any]: A dictionary containing the crawl results. The structure includes:
                - 'success' (bool): Indicates if the crawl was successful.
                - 'status' (str): The final status of the crawl job (e.g., 'completed').
                - 'completed' (int): Number of scraped pages that completed.
                - 'total' (int): Total number of scraped pages.
                - 'creditsUsed' (int): Estimated number of API credits used for this crawl.
                - 'expiresAt' (str): ISO 8601 formatted date-time string indicating when the crawl data expires.
                - 'data' (List[Dict]): List of all the scraped pages.

        Raises:
            Exception: If the crawl job initiation or monitoring fails.
        """
        endpoint = f'/v1/crawl'
        headers = self._prepare_headers(idempotency_key)
        json_data = {'url': url}
        if params:
            json_data.update(params)
        response = self._post_request(f'{self.api_url}{endpoint}', json_data, headers)
        if response.status_code == 200:
            id = response.json().get('id')
            return self._monitor_job_status(id, headers, poll_interval)

        else:
            self._handle_error(response, 'start crawl job')


    def async_crawl_url(self, url: str, params: Optional[Dict[str, Any]] = None, idempotency_key: Optional[str] = None) -> Dict[str, Any]:
        """
        Initiate a crawl job asynchronously.

        Args:
            url (str): The URL to crawl.
            params (Optional[Dict[str, Any]]): Additional parameters for the crawl request.
            idempotency_key (Optional[str]): A unique uuid key to ensure idempotency of requests.

        Returns:
            Dict[str, Any]: A dictionary containing the crawl initiation response. The structure includes:
                - 'success' (bool): Indicates if the crawl initiation was successful.
                - 'id' (str): The unique identifier for the crawl job.
                - 'url' (str): The URL to check the status of the crawl job.
        """
        endpoint = f'/v1/crawl'
        headers = self._prepare_headers(idempotency_key)
        json_data = {'url': url}
        if params:
            json_data.update(params)
        response = self._post_request(f'{self.api_url}{endpoint}', json_data, headers)
        if response.status_code == 200:
            return response.json()
        else:
            self._handle_error(response, 'start crawl job')

    def check_crawl_status(self, id: str) -> Any:
        """
        Check the status of a crawl job using the Firecrawl API.

        Args:
            id (str): The ID of the crawl job.

        Returns:
            Any: The status of the crawl job.

        Raises:
            Exception: If the status check request fails.
        """
        endpoint = f'/v1/crawl/{id}'

        headers = self._prepare_headers()
        response = self._get_request(f'{self.api_url}{endpoint}', headers)
        if response.status_code == 200:
            status_data = response.json()
            if status_data['status'] == 'completed':
                if 'data' in status_data:
                    data = status_data['data']
                    while 'next' in status_data:
                        next_url = status_data.get('next')
                        if not next_url:
                            logger.warning("Expected 'next' URL is missing.")
                            break
                        try:
                            status_response = self._get_request(next_url, headers)
                            if status_response.status_code != 200:
                                logger.error(f"Failed to fetch next page: {status_response.status_code}")
                                break
                            next_data = status_response.json()
                            data.extend(next_data.get('data', []))
                            status_data = next_data
                        except Exception as e:
                            logger.error(f"Error during pagination request: {e}")
                            break
                    status_data['data'] = data
                    
            return {
                'success': True,
                'status': status_data.get('status'),
                'total': status_data.get('total'),
                'completed': status_data.get('completed'),
                'creditsUsed': status_data.get('creditsUsed'),
                'expiresAt': status_data.get('expiresAt'),
                'data': status_data.get('data'),
                'error': status_data.get('error'),
                'next': status_data.get('next', None)
            }
        else:
            self._handle_error(response, 'check crawl status')
    
    def cancel_crawl(self, id: str) -> Dict[str, Any]:
        """
        Cancel an asynchronous crawl job using the Firecrawl API.

        Args:
            id (str): The ID of the crawl job to cancel.

        Returns:
            Dict[str, Any]: The response from the cancel crawl request.
        """
        headers = self._prepare_headers()
        response = self._delete_request(f'{self.api_url}/v1/crawl/{id}', headers)
        if response.status_code == 200:
            return response.json()
        else:
            self._handle_error(response, "cancel crawl job")

    def crawl_url_and_watch(self, url: str, params: Optional[Dict[str, Any]] = None, idempotency_key: Optional[str] = None) -> 'CrawlWatcher':
        """
        Initiate a crawl job and return a CrawlWatcher to monitor the job via WebSocket.

        Args:
            url (str): The URL to crawl.
            params (Optional[Dict[str, Any]]): Additional parameters for the crawl request.
            idempotency_key (Optional[str]): A unique uuid key to ensure idempotency of requests.

        Returns:
            CrawlWatcher: An instance of CrawlWatcher to monitor the crawl job.
        """
        crawl_response = self.async_crawl_url(url, params, idempotency_key)
        if crawl_response['success'] and 'id' in crawl_response:
            return CrawlWatcher(crawl_response['id'], self)
        else:
            raise Exception("Crawl job failed to start")

    def map_url(self, url: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """
        Perform a map search using the Firecrawl API.

        Args:
            url (str): The URL to perform the map search on.
            params (Optional[Dict[str, Any]]): Additional parameters for the map search.

        Returns:
            List[str]: A list of URLs discovered during the map search.
        """
        endpoint = f'/v1/map'
        headers = self._prepare_headers()

        # Prepare the base scrape parameters with the URL
        json_data = {'url': url}
        if params:
            json_data.update(params)

        # Make the POST request with the prepared headers and JSON data
        response = requests.post(
            f'{self.api_url}{endpoint}',
            headers=headers,
            json=json_data,
        )
        if response.status_code == 200:
            response = response.json()
            if response['success'] and 'links' in response:
                return response
            elif 'error' in response:
                raise Exception(f'Failed to map URL. Error: {response["error"]}')
            else:
                raise Exception(f'Failed to map URL. Error: {response}')
        else:
            self._handle_error(response, 'map')

    def batch_scrape_urls(self, urls: list[str],
                  params: Optional[Dict[str, Any]] = None,
                  poll_interval: Optional[int] = 2,
                  idempotency_key: Optional[str] = None) -> Any:
        """
        Initiate a batch scrape job for the specified URLs using the Firecrawl API.

        Args:
            urls (list[str]): The URLs to scrape.
            params (Optional[Dict[str, Any]]): Additional parameters for the scraper.
            poll_interval (Optional[int]): Time in seconds between status checks when waiting for job completion. Defaults to 2 seconds.
            idempotency_key (Optional[str]): A unique uuid key to ensure idempotency of requests.

        Returns:
            Dict[str, Any]: A dictionary containing the scrape results. The structure includes:
                - 'success' (bool): Indicates if the batch scrape was successful.
                - 'status' (str): The final status of the batch scrape job (e.g., 'completed').
                - 'completed' (int): Number of scraped pages that completed.
                - 'total' (int): Total number of scraped pages.
                - 'creditsUsed' (int): Estimated number of API credits used for this batch scrape.
                - 'expiresAt' (str): ISO 8601 formatted date-time string indicating when the batch scrape data expires.
                - 'data' (List[Dict]): List of all the scraped pages.

        Raises:
            Exception: If the batch scrape job initiation or monitoring fails.
        """
        endpoint = f'/v1/batch/scrape'
        headers = self._prepare_headers(idempotency_key)
        json_data = {'urls': urls}
        if params:
            json_data.update(params)
        response = self._post_request(f'{self.api_url}{endpoint}', json_data, headers)
        if response.status_code == 200:
            id = response.json().get('id')
            return self._monitor_job_status(id, headers, poll_interval)

        else:
            self._handle_error(response, 'start batch scrape job')


    def async_batch_scrape_urls(self, urls: list[str], params: Optional[Dict[str, Any]] = None, idempotency_key: Optional[str] = None) -> Dict[str, Any]:
        """
        Initiate a crawl job asynchronously.

        Args:
            urls (list[str]): The URLs to scrape.
            params (Optional[Dict[str, Any]]): Additional parameters for the scraper.
            idempotency_key (Optional[str]): A unique uuid key to ensure idempotency of requests.

        Returns:
            Dict[str, Any]: A dictionary containing the batch scrape initiation response. The structure includes:
                - 'success' (bool): Indicates if the batch scrape initiation was successful.
                - 'id' (str): The unique identifier for the batch scrape job.
                - 'url' (str): The URL to check the status of the batch scrape job.
        """
        endpoint = f'/v1/batch/scrape'
        headers = self._prepare_headers(idempotency_key)
        json_data = {'urls': urls}
        if params:
            json_data.update(params)
        response = self._post_request(f'{self.api_url}{endpoint}', json_data, headers)
        if response.status_code == 200:
            return response.json()
        else:
            self._handle_error(response, 'start batch scrape job')
    
    def batch_scrape_urls_and_watch(self, urls: list[str], params: Optional[Dict[str, Any]] = None, idempotency_key: Optional[str] = None) -> 'CrawlWatcher':
        """
        Initiate a batch scrape job and return a CrawlWatcher to monitor the job via WebSocket.

        Args:
            urls (list[str]): The URLs to scrape.
            params (Optional[Dict[str, Any]]): Additional parameters for the scraper.
            idempotency_key (Optional[str]): A unique uuid key to ensure idempotency of requests.

        Returns:
            CrawlWatcher: An instance of CrawlWatcher to monitor the batch scrape job.
        """
        crawl_response = self.async_batch_scrape_urls(urls, params, idempotency_key)
        if crawl_response['success'] and 'id' in crawl_response:
            return CrawlWatcher(crawl_response['id'], self)
        else:
            raise Exception("Batch scrape job failed to start")
    
    def check_batch_scrape_status(self, id: str) -> Any:
        """
        Check the status of a batch scrape job using the Firecrawl API.

        Args:
            id (str): The ID of the batch scrape job.

        Returns:
            Any: The status of the batch scrape job.

        Raises:
            Exception: If the status check request fails.
        """
        endpoint = f'/v1/batch/scrape/{id}'

        headers = self._prepare_headers()
        response = self._get_request(f'{self.api_url}{endpoint}', headers)
        if response.status_code == 200:
            status_data = response.json()
            if status_data['status'] == 'completed':
                if 'data' in status_data:
                    data = status_data['data']
                    while 'next' in status_data:
                        next_url = status_data.get('next')
                        if not next_url:
                            logger.warning("Expected 'next' URL is missing.")
                            break
                        try:
                            status_response = self._get_request(next_url, headers)
                            if status_response.status_code != 200:
                                logger.error(f"Failed to fetch next page: {status_response.status_code}")
                                break
                            next_data = status_response.json()
                            data.extend(next_data.get('data', []))
                            status_data = next_data
                        except Exception as e:
                            logger.error(f"Error during pagination request: {e}")
                            break
                    status_data['data'] = data

            return {
                'success': True,
                'status': status_data.get('status'),
                'total': status_data.get('total'),
                'completed': status_data.get('completed'),
                'creditsUsed': status_data.get('creditsUsed'),
                'expiresAt': status_data.get('expiresAt'),
                'data': status_data.get('data'),
                'error': status_data.get('error'),
                'next': status_data.get('next', None)
            }
        else:
            self._handle_error(response, 'check batch scrape status')


    def extract(self, urls: List[str], params: Optional[ExtractParams] = None) -> Any:
        """
        Extracts information from a URL using the Firecrawl API.

        Args:
            urls (List[str]): The URLs to extract information from.
            params (Optional[ExtractParams]): Additional parameters for the extract request.

        Returns:
            Union[ExtractResponse, ErrorResponse]: The response from the extract operation.
        """
        headers = self._prepare_headers()

        if not params or not params.get('prompt'):
            raise ValueError("Prompt is required")

        if not params.get('schema'):
            raise ValueError("Schema is required for extraction")

        jsonData = {'urls': urls, **params}
        jsonSchema = params['schema'].schema() if hasattr(params['schema'], 'schema') else None

        try:
            response = self._post_request(
                f'{self.api_url}/v1/extract',
                {
                    **jsonData,
                    'allowExternalLinks': params.get('allow_external_links', False),
                    'schema': jsonSchema
                },
                headers
            )
            if response.status_code == 200:
                data = response.json()
                if data['success']:
                    return data
                else:
                    raise Exception(f'Failed to extract. Error: {data["error"]}')
            else:
                self._handle_error(response, "extract")
        except Exception as e:
            raise ValueError(str(e), 500)

        return {'success': False, 'error': "Internal server error."}

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
    
    def _delete_request(self, url: str,
                        headers: Dict[str, str],
                        retries: int = 3,
                        backoff_factor: float = 0.5) -> requests.Response:
        """
        Make a DELETE request with retries.

        Args:
            url (str): The URL to send the DELETE request to.
            headers (Dict[str, str]): The headers to include in the DELETE request.
            retries (int): Number of retries for the request.
            backoff_factor (float): Backoff factor for retries.

        Returns:
            requests.Response: The response from the DELETE request.

        Raises:
            requests.RequestException: If the request fails after the specified retries.
        """
        for attempt in range(retries):
            response = requests.delete(url, headers=headers)
            if response.status_code == 502:
                time.sleep(backoff_factor * (2 ** attempt))
            else:
                return response
        return response

    def _monitor_job_status(self, id: str, headers: Dict[str, str], poll_interval: int) -> Any:
        """
        Monitor the status of a crawl job until completion.

        Args:
            id (str): The ID of the crawl job.
            headers (Dict[str, str]): The headers to include in the status check requests.
            poll_interval (int): Secounds between status checks.
        Returns:
            Any: The crawl results if the job is completed successfully.

        Raises:
            Exception: If the job fails or an error occurs during status checks.
        """
        while True:
            api_url = f'{self.api_url}/v1/crawl/{id}'

            status_response = self._get_request(api_url, headers)
            if status_response.status_code == 200:
                status_data = status_response.json()
                if status_data['status'] == 'completed':
                    if 'data' in status_data:
                        data = status_data['data']
                        while 'next' in status_data:
                          status_response = self._get_request(status_data['next'], headers)
                          status_data = status_response.json()
                          data.extend(status_data.get('data', []))
                        status_data['data'] = data
                        return status_data
                    else:
                        raise Exception('Crawl job completed but no data was returned')
                elif status_data['status'] in ['active', 'paused', 'pending', 'queued', 'waiting', 'scraping']:
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
        error_message = response.json().get('error', 'No error message provided.')
        error_details = response.json().get('details', 'No additional error details provided.')

        if response.status_code == 402:
            message = f"Payment Required: Failed to {action}. {error_message} - {error_details}"
        elif response.status_code == 408:
            message = f"Request Timeout: Failed to {action} as the request timed out. {error_message} - {error_details}"
        elif response.status_code == 409:
            message = f"Conflict: Failed to {action} due to a conflict. {error_message} - {error_details}"
        elif response.status_code == 500:
            message = f"Internal Server Error: Failed to {action}. {error_message} - {error_details}"
        else:
            message = f"Unexpected error during {action}: Status code {response.status_code}. {error_message} - {error_details}"

        # Raise an HTTPError with the custom message and attach the response
        raise requests.exceptions.HTTPError(message, response=response)

class CrawlWatcher:
    def __init__(self, id: str, app: FirecrawlApp):
        self.id = id
        self.app = app
        self.data: List[Dict[str, Any]] = []
        self.status = "scraping"
        self.ws_url = f"{app.api_url.replace('http', 'ws')}/v1/crawl/{id}"
        self.event_handlers = {
            'done': [],
            'error': [],
            'document': []
        }

    async def connect(self):
        async with websockets.connect(self.ws_url, extra_headers={"Authorization": f"Bearer {self.app.api_key}"}) as websocket:
            await self._listen(websocket)

    async def _listen(self, websocket):
        async for message in websocket:
            msg = json.loads(message)
            await self._handle_message(msg)

    def add_event_listener(self, event_type: str, handler):
        if event_type in self.event_handlers:
            self.event_handlers[event_type].append(handler)

    def dispatch_event(self, event_type: str, detail: Dict[str, Any]):
        if event_type in self.event_handlers:
            for handler in self.event_handlers[event_type]:
                handler(detail)

    async def _handle_message(self, msg: Dict[str, Any]):
        if msg['type'] == 'done':
            self.status = 'completed'
            self.dispatch_event('done', {'status': self.status, 'data': self.data})
        elif msg['type'] == 'error':
            self.status = 'failed'
            self.dispatch_event('error', {'status': self.status, 'data': self.data, 'error': msg['error']})
        elif msg['type'] == 'catchup':
            self.status = msg['data']['status']
            self.data.extend(msg['data'].get('data', []))
            for doc in self.data:
                self.dispatch_event('document', doc)
        elif msg['type'] == 'document':
            self.data.append(msg['data'])
            self.dispatch_event('document', msg['data'])
