//! The TypeSafe SDK 0.6.0 `systemOne` call as branding makes it: one retry,
//! a timeout per attempt, and the SDK's retry rules and delays.

use std::sync::OnceLock;
use std::time::Duration;

use reqwest::header::{ACCEPT, CONTENT_TYPE, HeaderMap};
use reqwest::{Client, RequestBuilder, StatusCode};
use serde_json::Value;
use tracing::{Span, field::Empty, instrument};

use super::super::super::super::engines::shared_client;
use super::super::js;
use super::config::{API_KEY, BASE_URL, TIMEOUT, random};

const MAX_RETRIES: u32 = 1;
const MAX_RETRY_AFTER_MS: f64 = 60_000.0;

static CLIENT: OnceLock<Client> = OnceLock::new();

#[derive(Debug, thiserror::Error)]
pub enum CallError {
  #[error("TypeSafe answered {0}")]
  Status(u16),
  #[error("TypeSafe timed out")]
  Timeout,
  #[error("TypeSafe connection failed")]
  Connection,
}

impl From<reqwest::Error> for CallError {
  fn from(error: reqwest::Error) -> Self {
    if error.is_timeout() {
      CallError::Timeout
    } else {
      CallError::Connection
    }
  }
}

async fn attempt(request: RequestBuilder) -> Result<(StatusCode, HeaderMap, Vec<u8>), CallError> {
  let response = request.send().await?;
  let status = response.status();
  let headers = response.headers().clone();
  let body = response.bytes().await?;
  Ok((status, headers, body.to_vec()))
}

/// `Number(x)` for a header value.
fn js_number(x: &str) -> Option<f64> {
  let x = js::trim(x);
  if x.is_empty() {
    return Some(0.0);
  }
  x.parse().ok()
}

/// SDK `parseRetryAfter`: `retry-after-ms`, else `Retry-After` as seconds or a date.
fn retry_after_ms(headers: &HeaderMap) -> Option<f64> {
  let header = |name| headers.get(name)?.to_str().ok();
  if let Some(ms) = header("retry-after-ms")
    .and_then(js_number)
    .filter(|ms| ms.is_finite() && *ms >= 0.0)
  {
    return Some(ms);
  }
  let raw = header("retry-after")?;
  if let Some(seconds) = js_number(raw).filter(|x| x.is_finite()) {
    return (seconds >= 0.0).then_some(seconds * 1000.0);
  }
  let date = chrono::DateTime::parse_from_rfc2822(raw.trim()).ok()?;
  Some(((date.timestamp_millis() - chrono::Utc::now().timestamp_millis()) as f64).max(0.0))
}

/// SDK `retryDelayMs`: the server's delay up to a minute, else exponential
/// backoff from 500 ms with 25% jitter.
fn retry_delay(attempt: u32, headers: Option<&HeaderMap>) -> Duration {
  if let Some(ms) = headers
    .and_then(retry_after_ms)
    .filter(|ms| *ms <= MAX_RETRY_AFTER_MS)
  {
    return Duration::from_secs_f64(ms / 1000.0);
  }
  let exponential = js::min(500.0 * 2f64.powi(attempt as i32), 5000.0);
  Duration::from_millis(js::round(exponential * (1.0 - random() * 0.25)) as u64)
}

/// The SDK's body parse: JSON when it is JSON, else the text.
fn parse_body(body: &[u8]) -> Value {
  if body.is_empty() {
    return Value::Null;
  }
  serde_json::from_slice(body)
    .unwrap_or_else(|_| Value::String(String::from_utf8_lossy(body).into_owned()))
}

/// POST `/v1/systemone`. Timeouts, connection errors, 408, 429 and 5xx are
/// retried once.
#[instrument(
  name = "transformers::branding::jev::system_one",
  skip_all,
  fields(attempts = Empty, http.status = Empty),
  err(Display)
)]
pub async fn system_one(body: Vec<u8>) -> Result<Value, CallError> {
  let span = Span::current();
  let key = API_KEY.as_deref().unwrap_or_default();
  let client = shared_client(&CLIENT).map_err(|_| CallError::Connection)?;
  let url = format!("{}/v1/systemone", *BASE_URL);
  let mut retry = 0;
  loop {
    span.record("attempts", retry + 1);
    let mut request = client
      .post(&url)
      .bearer_auth(key)
      .header(ACCEPT, "application/json")
      .header(CONTENT_TYPE, "application/json")
      .timeout(*TIMEOUT)
      .body(body.clone());
    if retry > 0 {
      request = request.header("X-TypeSafe-Retry-Count", retry.to_string());
    }
    let (error, headers) = match attempt(request).await {
      Ok((status, _, body)) if status.is_success() => {
        span.record("http.status", status.as_u16());
        return Ok(parse_body(&body));
      }
      Ok((status, headers, _)) => {
        span.record("http.status", status.as_u16());
        let retryable = matches!(status.as_u16(), 408 | 429) || status.is_server_error();
        if !retryable {
          return Err(CallError::Status(status.as_u16()));
        }
        (CallError::Status(status.as_u16()), Some(headers))
      }
      Err(error) => (error, None),
    };
    if retry >= MAX_RETRIES {
      return Err(error);
    }
    tokio::time::sleep(retry_delay(retry, headers.as_ref())).await;
    retry += 1;
  }
}
