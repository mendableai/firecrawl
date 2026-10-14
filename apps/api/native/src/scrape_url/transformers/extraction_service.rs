//! The product-search and menu-search call shared by TS `fetchProduct` and `fetchMenu`.

use std::{sync::OnceLock, time::Duration};

use reqwest::Client;
use serde::Serialize;
use serde_json::Value;
use tracing::{Span, field::Empty, instrument};

static CLIENT: OnceLock<Client> = OnceLock::new();

/// TS calls these services with a bare `fetch`, so only undici's default timeouts apply.
fn client() -> Result<&'static Client, reqwest::Error> {
  if let Some(client) = CLIENT.get() {
    return Ok(client);
  }
  let client = Client::builder()
    .connect_timeout(Duration::from_secs(10))
    .read_timeout(Duration::from_secs(300))
    .build()?;
  Ok(CLIENT.get_or_init(|| client))
}

pub struct ExtractionService {
  /// Starts TS's error messages: "Product" or "Menu".
  pub name: &'static str,
  pub path: &'static str,
  /// The response key that holds the extracted profile.
  pub key: &'static str,
}

#[derive(Serialize)]
pub struct ExtractionRequest<'a> {
  pub html: &'a str,
  pub url: &'a str,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub title: Option<&'a str>,
}

/// TS's thrown errors, word for word.
#[derive(Debug, thiserror::Error)]
pub enum ExtractionError {
  #[error("fetch failed")]
  Fetch(#[source] reqwest::Error),

  #[error("{0} extraction failed: {1}")]
  Status(&'static str, String),

  #[error("{0} extraction failed: service returned a non-JSON response")]
  NonJson(&'static str),

  #[error("{0} extraction failed: service returned an unexpected response shape (missing '{1}')")]
  MissingKey(&'static str, &'static str),

  /// TS reads `.detail` off an error body that is JSON `null`.
  #[error("Cannot read properties of null (reading 'detail')")]
  NullErrorBody,
}

impl ExtractionService {
  /// The profile under `key`, or `None` when the service says the page has none.
  #[instrument(
    name = "transformers::extraction_service::extract",
    skip_all,
    fields(service = self.name, http.status = Empty),
    err(Debug)
  )]
  pub async fn extract(
    &self,
    base_url: &str,
    request: &ExtractionRequest<'_>,
  ) -> Result<Option<Value>, ExtractionError> {
    let response = client()
      .map_err(ExtractionError::Fetch)?
      .post(format!("{base_url}{}", self.path))
      .json(request)
      .send()
      .await
      .map_err(ExtractionError::Fetch)?;
    let status = response.status();
    Span::current().record("http.status", status.as_u16());
    let body = response.bytes().await.ok().and_then(|x| parse_json(&x));

    if !status.is_success() {
      let detail = match body {
        Some(Value::Null) => return Err(ExtractionError::NullErrorBody),
        Some(Value::Object(x)) => js_string(x.get("detail")),
        Some(_) => js_string(None),
        None => "Unknown error".to_string(),
      };
      return Err(ExtractionError::Status(self.name, detail));
    }

    let Some(body) = body else {
      return Err(ExtractionError::NonJson(self.name));
    };
    let Value::Object(mut body) = body else {
      return Err(ExtractionError::MissingKey(self.name, self.key));
    };
    let Some(profile) = body.remove(self.key) else {
      return Err(ExtractionError::MissingKey(self.name, self.key));
    };
    Ok(js_truthy(&profile).then_some(profile))
  }
}

/// Fetch's `response.json()`: UTF-8 decode with replacement, BOM stripped, then `JSON.parse`.
fn parse_json(bytes: &[u8]) -> Option<Value> {
  let text = String::from_utf8_lossy(bytes);
  serde_json::from_str(text.strip_prefix('\u{feff}').unwrap_or(&text)).ok()
}

fn js_truthy(value: &Value) -> bool {
  match value {
    Value::Null => false,
    Value::Bool(x) => *x,
    Value::Number(x) => x.as_f64().is_some_and(|x| x != 0.0),
    Value::String(x) => !x.is_empty(),
    Value::Array(_) | Value::Object(_) => true,
  }
}

/// JS `String(value)`, with `None` standing for `undefined`.
fn js_string(value: Option<&Value>) -> String {
  match value {
    None => "undefined".to_string(),
    Some(Value::Null) => "null".to_string(),
    Some(Value::Bool(x)) => x.to_string(),
    Some(Value::Number(x)) if x.is_f64() => x.as_f64().map(|x| x.to_string()).unwrap_or_default(),
    Some(Value::Number(x)) => x.to_string(),
    Some(Value::String(x)) => x.clone(),
    Some(Value::Object(_)) => "[object Object]".to_string(),
    Some(Value::Array(items)) => items
      .iter()
      .map(|x| match x {
        Value::Null => String::new(),
        x => js_string(Some(x)),
      })
      .collect::<Vec<_>>()
      .join(","),
  }
}
