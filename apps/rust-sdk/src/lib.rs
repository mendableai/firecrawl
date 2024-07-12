/*
*
* - Structs and Enums:
*     FirecrawlError: Custom error enum for handling various errors.
*     FirecrawlApp: Main struct for the application, holding API key, URL, and HTTP client.
*
* - Initialization:
*
*     FirecrawlApp::new initializes the struct, fetching the API key and URL from environment variables if not provided.
*
* - API Methods:
*     scrape_url, search, crawl_url, check_crawl_status:
*       Methods for interacting with the Firecrawl API, similar to the Python methods.
*     monitor_job_status: Polls the API to monitor the status of a crawl job until completion.
*/

use std::env;
use std::thread;
use std::time::Duration;

use log::debug;
use reqwest::{Client, Response};
use serde_json::json;
use serde_json::Value;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum FirecrawlError {
    #[error("HTTP request failed: {0}")]
    HttpRequestFailed(String),
    #[error("API key not provided")]
    ApiKeyNotProvided,
    #[error("Failed to parse response: {0}")]
    ResponseParseError(String),
    #[error("Crawl job failed or stopped: {0}")]
    CrawlJobFailed(String),
}

#[derive(Clone, Debug)]
pub struct FirecrawlApp {
    api_key: String,
    api_url: String,
    client: Client,
}
// the api verstion of firecrawl
const API_VERSION: &str = "/v0";

impl FirecrawlApp {
    /// Initialize the FirecrawlApp instance.
    ///
    /// # Arguments:
    ///    * `api_key` (Optional[str]): API key for authenticating with the Firecrawl API.
    ///    * `api_url` (Optional[str]): Base URL for the Firecrawl API.
    pub fn new(api_key: Option<String>, api_url: Option<String>) -> Result<Self, FirecrawlError> {
        let api_key = api_key
            .or_else(|| env::var("FIRECRAWL_API_KEY").ok())
            .ok_or(FirecrawlError::ApiKeyNotProvided)?;
        let api_url = api_url.unwrap_or_else(|| {
            env::var("FIRECRAWL_API_URL")
                .unwrap_or_else(|_| "https://api.firecrawl.dev".to_string())
        });

        debug!("Initialized FirecrawlApp with API key: {}", api_key);
        debug!("Initialized FirecrawlApp with API URL: {}", api_url);

        Ok(FirecrawlApp {
            api_key,
            api_url,
            client: Client::new(),
        })
    }

    /// Scrape the specified URL using the Firecrawl API.
    ///
    /// # Arguments:
    ///    * `url` (str): The URL to scrape.
    ///    * `params` (Optional[Dict[str, Any]]): Additional parameters for the scrape request.
    ///
    /// # Returns:
    ///    * `Any`: The scraped data if the request is successful.
    ///
    /// # Raises:
    ///    * `Exception`: If the scrape request fails.
    pub async fn scrape_url(
        &self,
        url: &str,
        params: Option<Value>,
    ) -> Result<Value, FirecrawlError> {
        let headers = self.prepare_headers(None);
        let mut scrape_params = json!({"url": url});

        if let Some(mut params) = params {
            if let Some(extractor_options) = params.get_mut("extractorOptions") {
                if let Some(extraction_schema) = extractor_options.get_mut("extractionSchema") {
                    if extraction_schema.is_object() && extraction_schema.get("schema").is_some() {
                        extractor_options["extractionSchema"] = extraction_schema["schema"].clone();
                    }
                    extractor_options["mode"] = extractor_options
                        .get("mode")
                        .cloned()
                        .unwrap_or_else(|| json!("llm-extraction"));
                }
                scrape_params["extractorOptions"] = extractor_options.clone();
            }
            for (key, value) in params.as_object().unwrap() {
                if key != "extractorOptions" {
                    scrape_params[key] = value.clone();
                }
            }
        }

        let response = self
            .client
            .post(&format!("{}{}/scrape", self.api_url, API_VERSION))
            .headers(headers)
            .json(&scrape_params)
            .send()
            .await
            .map_err(|e| FirecrawlError::HttpRequestFailed(e.to_string()))?;

        self.handle_response(response, "scrape URL").await
    }

    /// Perform a search using the Firecrawl API.
    ///
    /// # Arguments:
    ///   * `query` (str): The search query.
    ///   * `params` (Optional[Dict[str, Any]]): Additional parameters for the search request.
    ///
    /// # Returns:
    ///   * `Any`: The search results if the request is successful.
    ///
    /// # Raises:
    ///   * `Exception`: If the search request fails.
    pub async fn search(
        &self,
        query: &str,
        params: Option<Value>,
    ) -> Result<Value, FirecrawlError> {
        let headers = self.prepare_headers(None);
        let mut json_data = json!({"query": query});
        if let Some(params) = params {
            for (key, value) in params.as_object().unwrap() {
                json_data[key] = value.clone();
            }
        }

        let response = self
            .client
            .post(&format!("{}{}/search", self.api_url, API_VERSION))
            .headers(headers)
            .json(&json_data)
            .send()
            .await
            .map_err(|e| FirecrawlError::HttpRequestFailed(e.to_string()))?;

        self.handle_response(response, "search").await
    }

    ///   Initiate a crawl job for the specified URL using the Firecrawl API.
    ///
    ///   # Arguments:
    ///       * `url` (str): The URL to crawl.
    ///       * `params` (Optional[Dict[str, Any]]): Additional parameters for the crawl request.
    ///       * `wait_until_done` (bool): Whether to wait until the crawl job is completed.
    ///       * `poll_interval` (int): Time in seconds between status checks when waiting for job completion.
    ///       * `idempotency_key` (Optional[str]): A unique uuid key to ensure idempotency of requests.
    ///
    ///   # Returns:
    ///       * `Any`: The crawl job ID or the crawl results if waiting until completion.
    ///
    ///   # `Raises`:
    ///       * `Exception`: If the crawl job initiation or monitoring fails.
    pub async fn crawl_url(
        &self,
        url: &str,
        params: Option<Value>,
        wait_until_done: bool,
        poll_interval: u64,
        idempotency_key: Option<String>,
    ) -> Result<Value, FirecrawlError> {
        let headers = self.prepare_headers(idempotency_key);
        let mut json_data = json!({"url": url});
        if let Some(params) = params {
            for (key, value) in params.as_object().unwrap() {
                json_data[key] = value.clone();
            }
        }

        let response = self
            .client
            .post(&format!("{}{}/crawl", self.api_url, API_VERSION))
            .headers(headers.clone())
            .json(&json_data)
            .send()
            .await
            .map_err(|e| FirecrawlError::HttpRequestFailed(e.to_string()))?;

        let response_json = self.handle_response(response, "start crawl job").await?;
        let job_id = response_json["jobId"].as_str().unwrap().to_string();

        if wait_until_done {
            self.monitor_job_status(&job_id, headers, poll_interval)
                .await
        } else {
            Ok(json!({"jobId": job_id}))
        }
    }

    /// Check the status of a crawl job using the Firecrawl API.
    ///
    /// # Arguments:
    ///     * `job_id` (str): The ID of the crawl job.
    ///
    /// # Returns:
    ///     * `Any`: The status of the crawl job.
    ///
    /// # Raises:
    ///     * `Exception`: If the status check request fails.
    pub async fn check_crawl_status(&self, job_id: &str) -> Result<Value, FirecrawlError> {
        let headers = self.prepare_headers(None);
        let response = self
            .client
            .get(&format!(
                "{}{}/crawl/status/{}",
                self.api_url, API_VERSION, job_id
            ))
            .headers(headers)
            .send()
            .await
            .map_err(|e| FirecrawlError::HttpRequestFailed(e.to_string()))?;

        self.handle_response(response, "check crawl status").await
    }

    /// Monitor the status of a crawl job until completion.
    ///
    /// # Arguments:
    ///     * `job_id` (str): The ID of the crawl job.
    ///     * `headers` (Dict[str, str]): The headers to include in the status check requests.
    ///     * `poll_interval` (int): Secounds between status checks.
    ///
    /// # Returns:
    ///     * `Any`: The crawl results if the job is completed successfully.
    ///
    /// # Raises:
    ///     Exception: If the job fails or an error occurs during status checks.
    async fn monitor_job_status(
        &self,
        job_id: &str,
        headers: reqwest::header::HeaderMap,
        poll_interval: u64,
    ) -> Result<Value, FirecrawlError> {
        loop {
            let response = self
                .client
                .get(&format!(
                    "{}{}/crawl/status/{}",
                    self.api_url, API_VERSION, job_id
                ))
                .headers(headers.clone())
                .send()
                .await
                .map_err(|e| FirecrawlError::HttpRequestFailed(e.to_string()))?;

            let status_data = self.handle_response(response, "check crawl status").await?;
            match status_data["status"].as_str() {
                Some("completed") => {
                    if status_data["data"].is_object() {
                        return Ok(status_data["data"].clone());
                    } else {
                        return Err(FirecrawlError::CrawlJobFailed(
                            "Crawl job completed but no data was returned".to_string(),
                        ));
                    }
                }
                Some("active") | Some("paused") | Some("pending") | Some("queued")
                | Some("waiting") => {
                    thread::sleep(Duration::from_secs(poll_interval));
                }
                Some(status) => {
                    return Err(FirecrawlError::CrawlJobFailed(format!(
                        "Crawl job failed or was stopped. Status: {}",
                        status
                    )));
                }
                None => {
                    return Err(FirecrawlError::CrawlJobFailed(
                        "Unexpected response: no status field".to_string(),
                    ));
                }
            }
        }
    }

    /// Prepare the headers for API requests.
    ///
    /// # Arguments:
    ///     `idempotency_key` (Optional[str]): A unique key to ensure idempotency of requests.
    ///
    /// # Returns:
    ///     Dict[str, str]: The headers including content type, authorization, and optionally idempotency key.
    fn prepare_headers(&self, idempotency_key: Option<String>) -> reqwest::header::HeaderMap {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert("Content-Type", "application/json".parse().unwrap());
        headers.insert(
            "Authorization",
            format!("Bearer {}", self.api_key).parse().unwrap(),
        );
        if let Some(key) = idempotency_key {
            headers.insert("x-idempotency-key", key.parse().unwrap());
        }
        headers
    }

    /// Handle errors from API responses.
    ///
    /// # Arguments:
    ///     * `response` (requests.Response): The response object from the API request.
    ///     * `action` (str): Description of the action that was being performed.
    ///
    /// # Raises:
    ///     Exception: An exception with a message containing the status code and error details from the response.
    async fn handle_response(
        &self,
        response: Response,
        action: &str,
    ) -> Result<Value, FirecrawlError> {
        if response.status().is_success() {
            let response_json: Value = response
                .json()
                .await
                .map_err(|e| FirecrawlError::ResponseParseError(e.to_string()))?;
            if response_json["success"].as_bool().unwrap_or(false) {
                Ok(response_json["data"].clone())
            } else {
                Err(FirecrawlError::HttpRequestFailed(format!(
                    "Failed to {}: {}",
                    action, response_json["error"]
                )))
            }
        } else {
            let status_code = response.status().as_u16();
            let error_message = response
                .json::<Value>()
                .await
                .unwrap_or_else(|_| json!({"error": "No additional error details provided."}));
            let message = match status_code {
                402 => format!(
                    "Payment Required: Failed to {}. {}",
                    action, error_message["error"]
                ),
                408 => format!(
                    "Request Timeout: Failed to {} as the request timed out. {}",
                    action, error_message["error"]
                ),
                409 => format!(
                    "Conflict: Failed to {} due to a conflict. {}",
                    action, error_message["error"]
                ),
                500 => format!(
                    "Internal Server Error: Failed to {}. {}",
                    action, error_message["error"]
                ),
                _ => format!(
                    "Unexpected error during {}: Status code {}. {}",
                    action, status_code, error_message["error"]
                ),
            };
            Err(FirecrawlError::HttpRequestFailed(message))
        }
    }
}
