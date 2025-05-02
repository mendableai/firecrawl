use std::collections::HashMap;

use schemars::schema_for;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{FirecrawlApp, FirecrawlError, API_VERSION};

/// Agent options for extract requests
#[derive(Deserialize, Serialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AgentOptionsExtract {
    /// Model to use for the agent
    pub model: String,
}

/// Parameters for extract requests
#[serde_with::skip_serializing_none]
#[derive(Deserialize, Serialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExtractParams {
    /// URLs to extract information from
    pub urls: Option<Vec<String>>,

    /// Extraction prompt
    pub prompt: Option<String>,

    /// Schema for structured output
    pub schema: Option<Value>,

    /// System prompt for the LLM
    pub system_prompt: Option<String>,

    /// Allow following external links
    pub allow_external_links: Option<bool>,

    /// Enable web search for additional information
    pub enable_web_search: Option<bool>,

    /// Show sources in the response
    pub show_sources: Option<bool>,

    /// Origin information, defaults to "api-sdk"
    pub origin: Option<String>,

    /// Timeout in milliseconds, defaults to 60000
    pub timeout: Option<u32>,

    /// Whether to include URL trace information, defaults to false
    pub url_trace: Option<bool>,

    /// Whether to ignore sitemap, defaults to false
    pub ignore_sitemap: Option<bool>,

    /// Whether to include subdomains, defaults to true
    pub include_subdomains: Option<bool>,

    /// Maximum number of URLs to process
    pub limit: Option<u32>,

    /// Agent options
    pub agent: Option<AgentOptionsExtract>,

    /// Experimental: Stream steps information
    #[serde(rename = "__experimental_streamSteps")]
    pub experimental_stream_steps: Option<bool>,

    /// Experimental: Include LLM usage information
    #[serde(rename = "__experimental_llmUsage")]
    pub experimental_llm_usage: Option<bool>,

    /// Experimental: Show sources information
    #[serde(rename = "__experimental_showSources")]
    pub experimental_show_sources: Option<bool>,

    /// Experimental: Cache key
    #[serde(rename = "__experimental_cacheKey")]
    pub experimental_cache_key: Option<String>,

    /// Experimental: Cache mode, defaults to "direct"
    #[serde(rename = "__experimental_cacheMode")]
    pub experimental_cache_mode: Option<String>,
}

/// Response from initiating an extract operation
#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExtractResponse {
    /// Whether the request was successful
    pub success: bool,

    /// The ID of the extract job
    pub id: String,

    /// URL trace information if requested
    pub url_trace: Option<Vec<URLTrace>>,
}

/// Information about URL processing during extraction
#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct URLTrace {
    /// The URL being processed
    pub url: String,

    /// Status of processing this URL
    pub status: String,

    /// Timing information for URL processing
    pub timing: URLTraceTiming,

    /// Error message if processing failed
    pub error: Option<String>,

    /// Warning message if there were issues
    pub warning: Option<String>,

    /// Content statistics
    pub content_stats: Option<ContentStats>,

    /// Relevance score for this URL (0-1)
    pub relevance_score: Option<f64>,

    /// Whether this URL was used in the final completion
    pub used_in_completion: Option<bool>,

    /// Fields extracted from this URL
    pub extracted_fields: Option<Vec<String>>,
}

/// Timing information for URL processing
#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct URLTraceTiming {
    /// When the URL was discovered
    pub discovered_at: String,

    /// When scraping began for this URL
    pub scraped_at: Option<String>,

    /// When processing was completed for this URL
    pub completed_at: Option<String>,
}

/// Statistics about processed content
#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ContentStats {
    /// Length of the raw content in characters
    pub raw_content_length: u32,

    /// Length of the processed content in characters
    pub processed_content_length: u32,

    /// Number of tokens used for this content
    pub tokens_used: u32,
}

/// Response for extract status check
#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExtractStatusResponse {
    /// Whether the request was successful
    pub success: bool,

    /// Status of the extract job: "pending", "processing", "completed", "failed"
    pub status: String,

    /// Extracted data, present when status is "completed"
    pub data: Option<Value>,

    /// Error message if the job failed
    pub error: Option<String>,

    /// URL trace information if requested
    pub url_trace: Option<Vec<URLTrace>>,

    /// Sources information if requested
    pub sources: Option<HashMap<String, Vec<String>>>,
}

impl FirecrawlApp {
    /// Extracts information from URLs using the Firecrawl API.
    ///
    /// This is the synchronous version that polls until completion.
    ///
    /// Either `params.prompt` or `params.schema` must be provided.
    pub async fn extract(
        &self,
        params: impl Into<ExtractParams>,
    ) -> Result<ExtractStatusResponse, FirecrawlError> {
        let mut params = params.into();
        // Validation: Either prompt or schema must be provided
        if params.prompt.is_none() && params.schema.is_none() {
            return Err(FirecrawlError::APIError(
                "Extract validation".to_string(),
                crate::error::FirecrawlAPIError {
                    success: false,
                    error: "Either prompt or schema must be provided".to_string(),
                    details: None,
                },
            ));
        }

        // Set default origin if not provided
        if params.origin.is_none() {
            params.origin = Some("api-sdk".to_string());
        }

        // Initiate the extract job asynchronously
        let response = self.async_extract(params).await?;

        // Poll for the result
        let poll_interval = 2000; // Default to 2 seconds
        self.monitor_extract_job_status(&response.id, poll_interval)
            .await
    }

    pub async fn extract_with_schemars<T>(
        &self,
        params: impl Into<ExtractParams>,
    ) -> Result<ExtractStatusResponse, FirecrawlError>
    where
        T: schemars::JsonSchema,
    {
        let mut params = params.into();
        let schema = schema_for!(T);
        let schema_json = serde_json::to_value(schema).map_err(|e| {
            FirecrawlError::APIError(
                "Schema serialization".to_string(),
                crate::error::FirecrawlAPIError {
                    success: false,
                    error: e.to_string(),
                    details: None,
                },
            )
        })?;
        params.schema = Some(schema_json);
        self.extract(params).await
    }

    /// Initiates an asynchronous extract operation.
    ///
    /// # Arguments
    ///
    /// * `params` - Parameters for the extract request
    ///
    /// # Returns
    ///
    /// A response containing the extract job ID, or a FirecrawlError if the request fails.
    ///
    /// # Notes
    ///
    /// Either `params.urls` or `params.prompt` must be provided.
    /// Either `params.prompt` or `params.schema` must be provided.
    pub async fn async_extract(
        &self,
        params: impl Into<ExtractParams>,
    ) -> Result<ExtractResponse, FirecrawlError> {
        let params = params.into();
        // Validation: Either URLs or prompt must be provided
        if params.urls.is_none() && params.prompt.is_none() {
            return Err(FirecrawlError::APIError(
                "Extract validation".to_string(),
                crate::error::FirecrawlAPIError {
                    success: false,
                    error: "Either URLs or prompt must be provided".to_string(),
                    details: None,
                },
            ));
        }

        // Validation: Either prompt or schema must be provided
        if params.prompt.is_none() && params.schema.is_none() {
            return Err(FirecrawlError::APIError(
                "Extract validation".to_string(),
                crate::error::FirecrawlAPIError {
                    success: false,
                    error: "Either prompt or schema must be provided".to_string(),
                    details: None,
                },
            ));
        }

        let headers = self.prepare_headers(None);

        let response = self
            .client
            .post(format!("{}{}/extract", self.api_url, API_VERSION))
            .headers(headers)
            .json(&params)
            .send()
            .await
            .map_err(|e| FirecrawlError::HttpError("Initiating extract job".to_string(), e))?;

        self.handle_response(response, "initiate extract job").await
    }

    /// Checks the status of an extract job.
    ///
    /// # Arguments
    ///
    /// * `id` - The ID of the extract job
    ///
    /// # Returns
    ///
    /// A response containing the status of the extract job, or a FirecrawlError if the request fails.
    pub async fn get_extract_status(
        &self,
        id: impl AsRef<str>,
    ) -> Result<ExtractStatusResponse, FirecrawlError> {
        let response = self
            .client
            .get(format!(
                "{}{}/extract/{}",
                self.api_url,
                API_VERSION,
                id.as_ref()
            ))
            .headers(self.prepare_headers(None))
            .send()
            .await
            .map_err(|e| {
                FirecrawlError::HttpError(format!("Checking status of extract {}", id.as_ref()), e)
            })?;

        self.handle_response(
            response,
            format!("Checking status of extract {}", id.as_ref()),
        )
        .await
    }

    /// Helper function to poll for extract job status until completion
    async fn monitor_extract_job_status(
        &self,
        id: &str,
        poll_interval: u64,
    ) -> Result<ExtractStatusResponse, FirecrawlError> {
        loop {
            let status_data = self.get_extract_status(id).await?;

            match status_data.status.as_str() {
                "completed" => {
                    break Ok(status_data);
                }
                "pending" | "processing" => {
                    tokio::time::sleep(tokio::time::Duration::from_millis(poll_interval)).await;
                }
                "failed" => {
                    let error_msg = status_data
                        .error
                        .clone()
                        .unwrap_or_else(|| "Extract job failed".to_string());
                    break Err(FirecrawlError::APIError(
                        "Extract job failed".to_string(),
                        crate::error::FirecrawlAPIError {
                            success: false,
                            error: error_msg,
                            details: None,
                        },
                    ));
                }
                _ => {
                    break Err(FirecrawlError::APIError(
                        "Extract job status".to_string(),
                        crate::error::FirecrawlAPIError {
                            success: false,
                            error: format!("Unexpected status: {}", status_data.status),
                            details: None,
                        },
                    ));
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    #[ignore = "Makes real network request"]
    async fn test_real_extract() {
        let api_url = std::env::var("FIRECRAWL_API_URL")
            .expect("Please set the FIRECRAWL_API_URL environment variable");
        let app = FirecrawlApp::new_selfhosted(api_url, None::<&str>).unwrap();

        // Create extract params
        let params = ExtractParams {
            urls: Some(vec!["https://example.com".to_string()]),
            prompt: Some("Extract the title and main content from this page".to_string()),
            schema: None,
            origin: Some("test".to_string()),
            ..Default::default()
        };

        // Start an extract job
        let response = app.async_extract(params).await.unwrap();

        assert!(response.success);
        assert!(!response.id.is_empty());
    }

    #[tokio::test]
    async fn test_async_extract_with_mock() {
        let mut server = mockito::Server::new_async().await;

        // Set up the mock for the extract request
        let mock = server
            .mock("POST", "/v1/extract")
            .match_body(mockito::Matcher::PartialJson(json!({
                "urls": ["https://example.com"],
                "prompt": "Extract the title and main content"
            })))
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "success": true,
                    "id": "extract-123",
                    "urlTrace": []
                })
                .to_string(),
            )
            .create();

        let app = FirecrawlApp::new_selfhosted(server.url(), Some("test_key")).unwrap();

        let params = ExtractParams {
            urls: Some(vec!["https://example.com".to_string()]),
            prompt: Some("Extract the title and main content".to_string()),
            schema: None,
            ..Default::default()
        };

        let response = app.async_extract(params).await.unwrap();

        assert!(response.success);
        assert_eq!(response.id, "extract-123");
        assert!(response.url_trace.unwrap_or_default().is_empty());
        mock.assert();
    }

    #[tokio::test]
    async fn test_extract_with_schema() {
        let mut server = mockito::Server::new_async().await;

        // Set up the mock for the extract request with schema
        let mock = server
            .mock("POST", "/v1/extract")
            .match_body(mockito::Matcher::PartialJson(json!({
                "urls": ["https://example.com"],
                "schema": {
                    "type": "object",
                    "properties": {
                        "title": { "type": "string" },
                        "content": { "type": "string" }
                    }
                }
            })))
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "success": true,
                    "id": "extract-123"
                })
                .to_string(),
            )
            .create();

        // Set up the mock for the status request
        let status_mock = server
            .mock("GET", "/v1/extract/extract-123")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "success": true,
                    "status": "completed",
                    "data": {
                        "title": "Example Domain",
                        "content": "This domain is for use in illustrative examples in documents."
                    }
                })
                .to_string(),
            )
            .create();

        let app = FirecrawlApp::new_selfhosted(server.url(), Some("test_key")).unwrap();

        let urls = Some(vec!["https://example.com".to_string()]);
        let params = ExtractParams {
            urls,
            schema: Some(json!({
                "type": "object",
                "properties": {
                    "title": { "type": "string" },
                    "content": { "type": "string" }
                }
            })),
            ..Default::default()
        };

        let response = app.extract(params).await.unwrap();

        assert!(response.success);
        assert_eq!(response.status, "completed");

        let data = response.data.unwrap();
        assert_eq!(data["title"], "Example Domain");
        assert_eq!(
            data["content"],
            "This domain is for use in illustrative examples in documents."
        );

        mock.assert();
        status_mock.assert();
    }

    #[tokio::test]
    async fn test_extract_status_with_mock() {
        let mut server = mockito::Server::new_async().await;

        // Set up the mock for the status check
        let mock = server
            .mock("GET", "/v1/extract/extract-123")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "success": true,
                    "status": "processing",
                    "urlTrace": [
                        {
                            "url": "https://example.com",
                            "status": "scraping",
                            "timing": {
                                "discoveredAt": "2023-01-01T00:00:00Z"
                            }
                        }
                    ]
                })
                .to_string(),
            )
            .create();

        let app = FirecrawlApp::new_selfhosted(server.url(), Some("test_key")).unwrap();
        let status = app.get_extract_status("extract-123").await.unwrap();

        assert!(status.success);
        assert_eq!(status.status, "processing");
        assert_eq!(status.url_trace.unwrap()[0].url, "https://example.com");
        mock.assert();
    }

    #[tokio::test]
    async fn test_extract_validation_errors() {
        let app = FirecrawlApp::new_selfhosted("https://example.com", Some("test_key")).unwrap();

        // Test missing both URLs and prompt
        let result = app.async_extract(ExtractParams::default()).await;
        assert!(result.is_err());

        // Test having URLs but missing both prompt and schema
        let params = ExtractParams {
            urls: Some(vec!["https://example.com".to_string()]),
            ..Default::default()
        };
        let result = app.async_extract(params).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_extract_api_error() {
        let mut server = mockito::Server::new_async().await;

        // Set up the mock for an error response
        let mock = server
            .mock("POST", "/v1/extract")
            .with_status(400)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "success": false,
                    "error": "Invalid schema format"
                })
                .to_string(),
            )
            .create();

        let app = FirecrawlApp::new_selfhosted(server.url(), Some("test_key")).unwrap();

        let params = ExtractParams {
            urls: Some(vec!["https://example.com".to_string()]),
            schema: Some(json!("invalid")), // Invalid schema format
            ..Default::default()
        };

        let result = app.async_extract(params).await;
        assert!(result.is_err());
        mock.assert();
    }
}
