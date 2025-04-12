use serde::{Deserialize, Serialize};

use crate::{FirecrawlApp, FirecrawlError, API_VERSION};

/// Parameters for generating LLMs.txt
#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GenerateLLMsTextParams {
    /// URL for which to generate LLMs.txt
    pub url: String,

    /// Maximum number of URLs to process. Default: 10
    pub max_urls: u32,

    /// Whether to show the full LLMs-full.txt in the response. Default: false
    pub show_full_text: bool,

    /// Experimental streaming option
    #[serde(rename = "__experimental_stream")]
    pub experimental_stream: bool,
}

impl Default for GenerateLLMsTextParams {
    fn default() -> Self {
        Self {
            url: String::new(),
            max_urls: 1,
            show_full_text: false,
            experimental_stream: false,
        }
    }
}

/// Response from initiating a LLMs.txt generation job
#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GenerateLLMsTextResponse {
    /// Whether the request was successful
    pub success: bool,

    /// Job ID for the LLMs.txt generation
    pub id: String,
}

#[derive(Deserialize, Serialize, Debug, Clone, Default)]
pub struct LLMTextData {
    #[serde(rename = "llmstxt")]
    pub compact: Option<String>,
    #[serde(rename = "llmsfulltxt")]
    pub full: Option<String>,
}

/// Response from checking the status of a LLMs.txt generation job
#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GenerateLLMsTextStatusResponse {
    /// Whether the request was successful
    pub success: bool,

    /// Status of the job: "pending", "processing", "completed", "failed"
    pub status: String,

    /// Generated LLMs.txt data, present when status is "completed"
    #[serde(default)]
    pub data: LLMTextData,

    /// Error message if the job failed
    pub error: Option<String>,

    /// Expiration timestamp for the data
    pub expires_at: String,
}

impl FirecrawlApp {
    /// Generates LLMs.txt for a given URL and polls until completion.
    ///
    /// # Arguments
    ///
    /// * `params` - Parameters for the LLMs.txt generation
    ///
    /// # Returns
    ///
    /// A response containing the generation results, or a FirecrawlError if the request fails.
    pub async fn generate_llms_text(
        &self,
        params: impl Into<GenerateLLMsTextParams>,
    ) -> Result<GenerateLLMsTextStatusResponse, FirecrawlError> {
        // Initiate the LLMs.txt generation job asynchronously
        let response = self.async_generate_llms_text(params).await?;

        // Poll for the result
        let poll_interval = 2000; // Default to 2 seconds
        self.monitor_llms_text_job_status(&response.id, poll_interval)
            .await
    }

    /// Initiates an asynchronous LLMs.txt generation operation.
    ///
    /// # Arguments
    ///
    /// * `params` - Parameters for the LLMs.txt generation
    ///
    /// # Returns
    ///
    /// A response containing the generation job ID, or a FirecrawlError if the request fails.
    pub async fn async_generate_llms_text(
        &self,
        params: impl Into<GenerateLLMsTextParams>,
    ) -> Result<GenerateLLMsTextResponse, FirecrawlError> {
        let params = params.into();

        // Validation: URL must be provided
        if params.url.is_empty() {
            return Err(FirecrawlError::APIError(
                "Generate LLMs.txt validation".to_string(),
                crate::error::FirecrawlAPIError {
                    success: false,
                    error: "URL must be provided".to_string(),
                    details: None,
                },
            ));
        }

        let headers = self.prepare_headers(None);

        let response = self
            .client
            .post(format!("{}{}/llmstxt", self.api_url, API_VERSION))
            .headers(headers)
            .json(&params)
            .send()
            .await
            .map_err(|e| {
                FirecrawlError::HttpError("Initiating LLMs.txt generation".to_string(), e)
            })?;

        self.handle_response(response, "initiate LLMs.txt generation")
            .await
    }

    /// Checks the status of a LLMs.txt generation operation.
    ///
    /// # Arguments
    ///
    /// * `id` - The ID of the LLMs.txt generation operation
    ///
    /// # Returns
    ///
    /// A response containing the current status and results of the generation operation,
    /// or a FirecrawlError if the request fails.
    pub async fn check_generate_llms_text_status(
        &self,
        id: impl AsRef<str>,
    ) -> Result<GenerateLLMsTextStatusResponse, FirecrawlError> {
        let response = self
            .client
            .get(format!(
                "{}{}/llmstxt/{}",
                self.api_url,
                API_VERSION,
                id.as_ref()
            ))
            .headers(self.prepare_headers(None))
            .send()
            .await
            .map_err(|e| {
                FirecrawlError::HttpError(
                    format!("Checking status of LLMs.txt generation {}", id.as_ref()),
                    e,
                )
            })?;

        self.handle_response(
            response,
            format!("Checking status of LLMs.txt generation {}", id.as_ref()),
        )
        .await
    }

    /// Helper function to poll for LLMs.txt generation job status until completion
    async fn monitor_llms_text_job_status(
        &self,
        id: &str,
        poll_interval: u64,
    ) -> Result<GenerateLLMsTextStatusResponse, FirecrawlError> {
        loop {
            let status_data = self.check_generate_llms_text_status(id).await?;

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
                        .unwrap_or_else(|| "LLMs.txt generation failed".to_string());
                    break Err(FirecrawlError::APIError(
                        "LLMs.txt generation failed".to_string(),
                        crate::error::FirecrawlAPIError {
                            success: false,
                            error: error_msg,
                            details: None,
                        },
                    ));
                }
                _ => {
                    break Err(FirecrawlError::APIError(
                        "LLMs.txt generation status".to_string(),
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
    async fn test_real_generate_llms_text() {
        let api_url = std::env::var("FIRECRAWL_API_URL")
            .expect("Please set the FIRECRAWL_API_URL environment variable");
        let app = FirecrawlApp::new_selfhosted(api_url, None::<&str>).unwrap();

        let params = GenerateLLMsTextParams {
            url: "https://example.com".to_string(),
            max_urls: 5,
            show_full_text: true,
            ..Default::default()
        };

        let response = app.async_generate_llms_text(params).await.unwrap();

        assert!(response.success);
        assert!(!response.id.is_empty());
    }

    #[tokio::test]
    async fn test_async_generate_llms_text_with_mock() {
        let mut server = mockito::Server::new_async().await;

        let mock = server
            .mock("POST", "/v1/llmstxt")
            .match_body(mockito::Matcher::PartialJson(json!({
                "url": "https://example.com",
                "maxUrls": 5
            })))
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "success": true,
                    "id": "llmstxt-123"
                })
                .to_string(),
            )
            .create();

        let app = FirecrawlApp::new_selfhosted(server.url(), Some("test_key")).unwrap();

        let params = GenerateLLMsTextParams {
            url: "https://example.com".to_string(),
            max_urls: 5,
            ..Default::default()
        };

        let response = app.async_generate_llms_text(params).await.unwrap();

        assert!(response.success);
        assert_eq!(response.id, "llmstxt-123");
        mock.assert();
    }

    #[tokio::test]
    async fn test_check_generate_llms_text_status_with_mock() {
        let mut server = mockito::Server::new_async().await;

        let mock = server
            .mock("GET", "/v1/llmstxt/llmstxt-123")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "success": true,
                    "status": "processing",
                    "expiresAt": "2023-01-01T00:00:00Z"
                })
                .to_string(),
            )
            .create();

        let app = FirecrawlApp::new_selfhosted(server.url(), Some("test_key")).unwrap();
        let status = app
            .check_generate_llms_text_status("llmstxt-123")
            .await
            .unwrap();

        assert!(status.success);
        assert_eq!(status.status, "processing");
        assert_eq!(status.expires_at, "2023-01-01T00:00:00Z");
        mock.assert();
    }

    #[tokio::test]
    async fn test_generate_llms_text_with_mock() {
        let mut server = mockito::Server::new_async().await;

        // Set up the mock for the generate request
        let mock = server
            .mock("POST", "/v1/llmstxt")
            .match_body(mockito::Matcher::PartialJson(json!({
                "url": "https://example.com",
                "showFullText": true
            })))
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "success": true,
                    "id": "llmstxt-123"
                })
                .to_string(),
            )
            .create();

        // Set up the mock for the status request
        let status_mock = server
            .mock("GET", "/v1/llmstxt/llmstxt-123")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "success": true,
                    "status": "completed",
                    "data": {
                        "llmstxt": "Allow: /about\nDisallow: /admin\n",
                        "llmsfulltxt": "# LLMs.txt\n\nAllow: /about\nDisallow: /admin\n"
                    },
                    "expiresAt": "2023-01-01T00:00:00Z"
                })
                .to_string(),
            )
            .create();

        let app = FirecrawlApp::new_selfhosted(server.url(), Some("test_key")).unwrap();

        let params = GenerateLLMsTextParams {
            url: "https://example.com".to_string(),
            show_full_text: true,
            ..Default::default()
        };

        let response = app.generate_llms_text(params).await.unwrap();

        assert!(response.success);
        assert_eq!(response.status, "completed");

        let data = response.data;
        assert_eq!(
            data.compact,
            Some("Allow: /about\nDisallow: /admin\n".into())
        );
        assert_eq!(
            data.full,
            Some("# LLMs.txt\n\nAllow: /about\nDisallow: /admin\n".into())
        );

        mock.assert();
        status_mock.assert();
    }

    #[tokio::test]
    async fn test_generate_llms_text_validation_errors() {
        let app = FirecrawlApp::new_selfhosted("https://example.com", Some("test_key")).unwrap();

        // Test missing URL
        let params = GenerateLLMsTextParams {
            url: "".to_string(),
            ..Default::default()
        };
        let result = app.async_generate_llms_text(params).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_generate_llms_text_api_error() {
        let mut server = mockito::Server::new_async().await;

        // Set up the mock for an error response
        let mock = server
            .mock("POST", "/v1/llmstxt")
            .with_status(400)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "success": false,
                    "error": "Invalid URL format"
                })
                .to_string(),
            )
            .create();

        let app = FirecrawlApp::new_selfhosted(server.url(), Some("test_key")).unwrap();

        let params = GenerateLLMsTextParams {
            url: "not-a-valid-url".to_string(),
            ..Default::default()
        };

        let result = app.async_generate_llms_text(params).await;
        assert!(result.is_err());
        mock.assert();
    }
}
