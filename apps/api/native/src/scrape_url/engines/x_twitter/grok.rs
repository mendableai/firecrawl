//! One structured-output call to xAI's Responses API with Grok's `x_search` tool,
//! retried like the AI SDK does: twice, on 408/409/429/5xx and network errors.

use std::{sync::OnceLock, time::Duration};

use reqwest::header::HeaderMap;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use tracing::{Span, field::Empty};

use super::super::super::{
  cost_tracking::{CostTrackingTokens, calculate_cost},
  error::ScrapeURLError,
  meta::Meta,
};
use super::{super::Engine, XTwitterEngine};

const XAI_RESPONSES_URL: &str = "https://api.x.ai/v1/responses";
const XAI_RESPONSES_MODEL: &str = "grok-4-1-fast-non-reasoning";
const MAX_ATTEMPTS: u32 = 3;
const FIRST_RETRY_DELAY: Duration = Duration::from_secs(2);
/// xAI bills X Search per item fetched, on top of tokens. USD per item.
const X_SEARCH_USD_PER_POST: f64 = 5.0 / 1000.0;
const X_SEARCH_USD_PER_PROFILE: f64 = 10.0 / 1000.0;

static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

pub struct GrokCall {
  /// The cost entry's `method`, like TS `recordGrokCost`.
  pub method: &'static str,
  pub prompt: String,
  pub tool: Value,
  pub output_name: &'static str,
  pub output_description: &'static str,
  pub schema: Value,
}

fn engine_error(error: String) -> ScrapeURLError {
  ScrapeURLError::UnclassifiedEngineError {
    engine: XTwitterEngine::NAME,
    error,
  }
}

/// A failed attempt, and the delay xAI asked for before a retry.
struct Failure {
  error: String,
  retryable: bool,
  retry_after: Option<Duration>,
}

/// `retry-after-ms`, then `retry-after` in seconds, when under a minute.
fn retry_after(headers: &HeaderMap) -> Option<Duration> {
  let read = |name: &str| headers.get(name)?.to_str().ok()?.trim().parse::<f64>().ok();
  let ms = read("retry-after-ms").or_else(|| read("retry-after").map(|x| x * 1000.0))?;
  (0.0..60_000.0)
    .contains(&ms)
    .then(|| Duration::from_millis(ms as u64))
}

/// xAI's own message when the error body carries one.
fn error_message(status: u16, body: &str) -> String {
  let parsed: Option<Value> = serde_json::from_str(body).ok();
  let message = parsed.as_ref().and_then(|x| {
    x.get("error")
      .and_then(|e| e.as_str().or_else(|| e.get("message")?.as_str()))
  });
  match message {
    Some(message) => format!("xAI responded with status {status}: {message}"),
    None => format!("xAI responded with status {status}"),
  }
}

async fn attempt(meta: &Meta, api_key: &str, body: &Value) -> Result<Value, Failure> {
  let network = |e: reqwest::Error| Failure {
    error: e.to_string(),
    retryable: true,
    retry_after: None,
  };
  let client = super::super::shared_client(&CLIENT).map_err(network)?;
  let mut request = client
    .post(XAI_RESPONSES_URL)
    .bearer_auth(api_key)
    .json(body);
  if let Some(remaining) = meta.remaining_ms() {
    request = request.timeout(Duration::from_millis(remaining));
  }
  let response = request.send().await.map_err(network)?;
  let status = response.status().as_u16();
  Span::current().record("http.status", status);
  if response.status().is_success() {
    return response.json().await.map_err(network);
  }
  let retry_after = retry_after(response.headers());
  let text = response.text().await.unwrap_or_default();
  Err(Failure {
    error: error_message(status, &text),
    retryable: matches!(status, 408 | 409 | 429) || status >= 500,
    retry_after,
  })
}

/// The output text of the response's message items, joined.
fn output_text(response: &Value) -> String {
  let parts = response["output"]
    .as_array()
    .into_iter()
    .flatten()
    .filter(|x| x["type"] == "message")
    .flat_map(|x| x["content"].as_array().into_iter().flatten())
    .filter(|x| x["type"] == "output_text")
    .filter_map(|x| x["text"].as_str());
  parts.collect()
}

/// Records the token cost plus the X Search fee for the items the call fetched.
fn record_usage(meta: &Meta, span: &Span, response: &Value, method: &str) {
  let usage = &response["usage"];
  let details = &usage["server_side_tool_usage_details"];
  let tokens = CostTrackingTokens {
    input: usage["input_tokens"].as_u64().unwrap_or(0),
    output: usage["output_tokens"].as_u64().unwrap_or(0),
  };
  let posts = details["x_posts_fetched"].as_u64().unwrap_or(0);
  let profiles = details["x_users_fetched"].as_u64().unwrap_or(0);
  span.record("gen_ai.usage.input_tokens", tokens.input);
  span.record("gen_ai.usage.output_tokens", tokens.output);
  span.record("x_search.posts", posts);
  span.record("x_search.profiles", profiles);
  let cost = calculate_cost(XAI_RESPONSES_MODEL, tokens.input, tokens.output)
    + posts as f64 * X_SEARCH_USD_PER_POST
    + profiles as f64 * X_SEARCH_USD_PER_PROFILE;
  let metadata = json!({
    "module": "scrapeURL",
    "method": method,
    "xSearchPosts": posts,
    "xSearchProfiles": profiles,
  });
  meta
    .cost_tracking
    .add_call(metadata, XAI_RESPONSES_MODEL, cost, tokens);
}

/// Runs `call` and parses its structured output as `T`.
#[tracing::instrument(
  name = "XTwitterEngine::grok",
  skip_all,
  fields(
    gen_ai.request.model = XAI_RESPONSES_MODEL,
    output = call.output_name,
    attempts = Empty,
    http.status = Empty,
    gen_ai.usage.input_tokens = Empty,
    gen_ai.usage.output_tokens = Empty,
    x_search.posts = Empty,
    x_search.profiles = Empty,
  ),
  err
)]
pub async fn grok<T: DeserializeOwned>(
  meta: &Meta,
  api_key: &str,
  call: GrokCall,
) -> Result<T, ScrapeURLError> {
  let span = Span::current();
  let body = json!({
    "model": XAI_RESPONSES_MODEL,
    "input": [{ "role": "user", "content": [{ "type": "input_text", "text": call.prompt }] }],
    "max_output_tokens": 20000,
    "text": { "format": {
      "type": "json_schema",
      "strict": true,
      "name": call.output_name,
      "description": call.output_description,
      "schema": call.schema,
    } },
    "tools": [call.tool],
  });

  let mut delay = FIRST_RETRY_DELAY;
  let mut attempts = 0;
  let response = loop {
    attempts += 1;
    span.record("attempts", attempts);
    let failure = match attempt(meta, api_key, &body).await {
      Ok(response) => break response,
      Err(failure) => failure,
    };
    let wait = failure.retry_after.unwrap_or(delay);
    let fits = meta
      .remaining_ms()
      .is_none_or(|x| u128::from(x) > wait.as_millis());
    match failure.retryable {
      true if attempts < MAX_ATTEMPTS && fits => tokio::time::sleep(wait).await,
      _ if attempts == 1 => return Err(engine_error(failure.error)),
      _ => {
        return Err(engine_error(format!(
          "Failed after {attempts} attempts. Last error: {}",
          failure.error
        )));
      }
    }
    delay *= 2;
  };

  record_usage(meta, &span, &response, call.method);
  serde_json::from_str(&output_text(&response)).map_err(|e| {
    engine_error(format!(
      "No object generated: could not parse the response: {e}"
    ))
  })
}
