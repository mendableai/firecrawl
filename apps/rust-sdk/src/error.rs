use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct FirecrawlAPIError {
    /// Always false.
    success: bool,

    /// Error message
    pub error: String,

    /// Additional details of this error. Schema depends on the error itself.
    pub details: Option<Value>,
}

#[derive(Error, Debug)]
pub enum FirecrawlError {
    #[error("HTTP request failed: {0}")]
    HttpRequestFailed(String),
    #[error("API key not provided")]
    APIKeyNotProvided,
    #[error("Failed to parse response: {0}")]
    ResponseParseError(String),
    #[error("API error")]
    APIError(FirecrawlAPIError),
    #[error("Crawl job failed or stopped: {0}")]
    CrawlJobFailed(String),
}
