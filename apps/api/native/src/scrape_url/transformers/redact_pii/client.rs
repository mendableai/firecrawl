//! One fire-privacy `/redact` call, after TS `redactOnce`.

use std::{
  sync::{LazyLock, OnceLock},
  time::Duration,
};

use reqwest::{Client, StatusCode};
use serde::Serialize;
use serde_json::Value;
use tracing::{Span, field::Empty, instrument};

use super::super::super::{
  engines::shared_client,
  options::{RedactPiiEntity, RedactPiiMode, RedactPiiOptions, RedactPiiReplaceStyle},
};

static CLIENT: OnceLock<Client> = OnceLock::new();

pub static FIRE_PRIVACY_URL: LazyLock<Option<String>> = LazyLock::new(|| {
  std::env::var("FIRE_PRIVACY_URL")
    .ok()
    .filter(|x| !x.is_empty())
});

static FIRE_PRIVACY_TIMEOUT: LazyLock<Duration> = LazyLock::new(|| {
  let ms = std::env::var("FIRE_PRIVACY_TIMEOUT_MS")
    .ok()
    .and_then(|x| x.parse::<u64>().ok())
    .filter(|x| *x > 0);
  Duration::from_millis(ms.unwrap_or(5000))
});

/// A redaction span in source coordinates (UTF-16 units of the markdown).
pub struct RedactionSpan {
  pub start: i64,
  pub end: i64,
  pub entity: Option<RedactPiiEntity>,
  pub kind: String,
}

pub enum ChunkResult {
  Ok {
    spans: Vec<RedactionSpan>,
    redacted_text: String,
    upstream_skipped: bool,
  },
  Failed(&'static str),
}

#[derive(Serialize)]
struct RedactRequest<'a> {
  text: &'a str,
  mode: &'static str,
  operator: &'static str,
  language: &'static str,
}

#[instrument(
  name = "transformers::redact_pii::redact_once",
  skip_all,
  fields(chunk_start = chunk_start, failure = Empty),
)]
pub async fn redact_once(
  base_url: &str,
  text: String,
  chunk_start: usize,
  options: &RedactPiiOptions,
) -> ChunkResult {
  let result = request(base_url, &text, chunk_start, options).await;
  if let ChunkResult::Failed(reason) = &result {
    Span::current().record("failure", *reason);
  }
  result
}

async fn request(
  base_url: &str,
  text: &str,
  chunk_start: usize,
  options: &RedactPiiOptions,
) -> ChunkResult {
  let body = RedactRequest {
    text,
    mode: match options.mode {
      RedactPiiMode::Accurate => "model",
      RedactPiiMode::Aggressive => "both",
      RedactPiiMode::Fast => "heuristics",
    },
    operator: match options.replace_style {
      RedactPiiReplaceStyle::Tag => "replace",
      RedactPiiReplaceStyle::Mask => "mask",
      RedactPiiReplaceStyle::Remove => "redact",
    },
    language: "en",
  };
  let Ok(client) = shared_client(&CLIENT) else {
    return ChunkResult::Failed("error");
  };
  let response = client
    .post(format!("{base_url}/redact"))
    .json(&body)
    .timeout(*FIRE_PRIVACY_TIMEOUT)
    .send()
    .await;
  let response = match response {
    Ok(x) => x,
    Err(e) if e.is_timeout() => return ChunkResult::Failed("timeout"),
    Err(_) => return ChunkResult::Failed("error"),
  };
  if response.status() == StatusCode::SERVICE_UNAVAILABLE {
    return ChunkResult::Failed("service_unavailable");
  }
  if !response.status().is_success() {
    return ChunkResult::Failed("error");
  }
  let Ok(body) = response.json::<Value>().await else {
    return ChunkResult::Failed("error");
  };

  let model_status = body.get("model_status").and_then(Value::as_str);
  let Some(redacted_text) = body.get("redacted_text").and_then(Value::as_str) else {
    return ChunkResult::Failed("error");
  };
  if model_status == Some("error") {
    return ChunkResult::Failed("error");
  }

  let offset = chunk_start as i64;
  let spans = coerce_spans(body.get("spans"))
    .map(|x| RedactionSpan {
      start: x.start + offset,
      end: x.end + offset,
      ..x
    })
    .collect();
  ChunkResult::Ok {
    spans,
    redacted_text: redacted_text.to_string(),
    upstream_skipped: model_status == Some("skipped"),
  }
}

/// TS `coerceSpans`: the well-formed spans, each mapped to its entity bucket.
fn coerce_spans(value: Option<&Value>) -> impl Iterator<Item = RedactionSpan> + '_ {
  value
    .and_then(Value::as_array)
    .into_iter()
    .flatten()
    .filter_map(|raw| {
      let kind = raw.get("kind")?.as_str()?;
      Some(RedactionSpan {
        start: raw.get("start")?.as_i64()?,
        end: raw.get("end")?.as_i64()?,
        entity: kind_to_entity(kind),
        kind: kind.to_string(),
      })
    })
}

/// TS `KIND_TO_ENTITY`: OPF and Presidio span kinds onto the public entities.
fn kind_to_entity(kind: &str) -> Option<RedactPiiEntity> {
  Some(match kind {
    "PRIVATE_PERSON" | "PERSON" => RedactPiiEntity::Person,
    "PRIVATE_EMAIL" | "EMAIL_ADDRESS" => RedactPiiEntity::Email,
    "PRIVATE_PHONE" | "PHONE_NUMBER" | "PHONEIMEI" => RedactPiiEntity::Phone,
    "PRIVATE_ADDRESS" | "LOCATION" => RedactPiiEntity::Location,
    "ACCOUNT_NUMBER" | "CREDIT_CARD" | "IBAN_CODE" | "US_BANK_NUMBER" | "US_SSN" | "US_ITIN"
    | "CRYPTO" => RedactPiiEntity::Financial,
    "SECRET" | "API_KEY" | "PASSWORD" | "US_DRIVER_LICENSE" | "US_PASSPORT" | "MEDICAL_LICENSE" => {
      RedactPiiEntity::Secret
    }
    _ => return None,
  })
}
