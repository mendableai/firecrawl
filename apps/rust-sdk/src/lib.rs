use reqwest::{Client, Response};
use serde::de::DeserializeOwned;
use serde_json::json;
use serde_json::Value;

pub mod crawl;
pub mod document;
mod error;
pub mod scrape;

pub use error::FirecrawlError;

#[derive(Clone, Debug)]
pub struct FirecrawlApp {
    api_key: String,
    api_url: String,
    client: Client,
}

pub(crate) const API_VERSION: &str = "/v1";

impl FirecrawlApp {
    pub fn new(api_key: Option<String>, api_url: Option<String>) -> Result<Self, FirecrawlError> {
        let api_key = api_key
            .ok_or(FirecrawlError::APIKeyNotProvided)?;
        let api_url = api_url
            .unwrap_or_else(|| "https://api.firecrawl.dev".to_string());

        Ok(FirecrawlApp {
            api_key,
            api_url,
            client: Client::new(),
        })
    }

    fn prepare_headers(&self, idempotency_key: Option<&String>) -> reqwest::header::HeaderMap {
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

    async fn handle_response<'a, T: DeserializeOwned>(
        &self,
        response: Response,
        action: impl AsRef<str>,
    ) -> Result<T, FirecrawlError> {
        if response.status().is_success() {
            let response_json: Value = response
                .json()
                .await
                .map_err(|e| FirecrawlError::ResponseParseError(e.to_string()))?;
            if response_json["success"].as_bool().unwrap_or(false) {
                Ok(serde_json::from_value(response_json).map_err(|e| FirecrawlError::ResponseParseError(e.to_string()))?)
            } else {
                Err(FirecrawlError::HttpRequestFailed(format!(
                    "Failed to {}: {}",
                    action.as_ref(), response_json["error"]
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
                    action.as_ref(), error_message["error"]
                ),
                408 => format!(
                    "Request Timeout: Failed to {} as the request timed out. {}",
                    action.as_ref(), error_message["error"]
                ),
                409 => format!(
                    "Conflict: Failed to {} due to a conflict. {}",
                    action.as_ref(), error_message["error"]
                ),
                500 => format!(
                    "Internal Server Error: Failed to {}. {}",
                    action.as_ref(), error_message["error"]
                ),
                _ => format!(
                    "Unexpected error during {}: Status code {}. {}",
                    action.as_ref(), status_code, error_message["error"]
                ),
            };
            Err(FirecrawlError::HttpRequestFailed(message))
        }
    }
}
