//! TS `makeAskLlm`: the `askLlm` the extractor calls at runtime. Caches
//! responses, dedupes identical calls, caps real API calls, and resolves any
//! failure to null so one bad inner call can't sink the extraction.

use std::{
  collections::HashMap,
  sync::{
    Arc, Mutex,
    atomic::{AtomicUsize, Ordering},
  },
};

use genai::chat::{ChatMessage, ChatOptions};
use serde_json::Value;
use tokio::sync::OnceCell;
use tracing::{Span, field::Empty, instrument};

use super::super::super::{cost_tracking::CostTracking, llm::LlmError};
use super::{
  DeterministicJsonError, cache,
  config::{ASK_LLM_MAX_CALLS, ASK_LLM_MAX_TOKENS, LIGHT_MODEL},
  js,
  llm::{Provider, generate_text, record, response_text},
  prompts::ASK_LLM_SYSTEM,
  sha,
};

const ASK_LLM_RETRIES: u32 = 3;

pub struct AskLlm {
  cost_tracking: Arc<CostTracking>,
  max_calls: usize,
  api_calls: AtomicUsize,
  in_flight: Mutex<HashMap<String, Arc<OnceCell<Value>>>>,
}

impl AskLlm {
  pub fn new(cost_tracking: Arc<CostTracking>) -> Self {
    Self {
      cost_tracking,
      max_calls: ASK_LLM_MAX_CALLS,
      api_calls: AtomicUsize::new(0),
      in_flight: Mutex::default(),
    }
  }

  /// `askLlm(prompt, schema)`: a JSON value, or null on any failure.
  pub async fn ask(&self, prompt: String, schema: Option<Value>) -> Value {
    let key = match &schema {
      None => prompt.clone(),
      Some(schema) => format!("{prompt}\0{schema}"),
    };
    let cell = self
      .in_flight
      .lock()
      .unwrap_or_else(|e| e.into_inner())
      .entry(key)
      .or_default()
      .clone();
    cell
      .get_or_init(|| async {
        self
          .ask_once(&prompt, schema.as_ref())
          .await
          .unwrap_or(Value::Null)
      })
      .await
      .clone()
  }

  #[instrument(
    name = "deterministic_json::ask_llm",
    skip_all,
    fields(structured = schema.is_some(), cache_hit = Empty, attempts = Empty, tokens.input = Empty, tokens.output = Empty),
    err
  )]
  async fn ask_once(
    &self,
    prompt: &str,
    schema: Option<&Value>,
  ) -> Result<Value, DeterministicJsonError> {
    let span = Span::current();
    let request = Request::new(prompt, schema)?;
    let cache_key = sha(&format!(
      "{}\0{ASK_LLM_SYSTEM}\0{}\0{}",
      *LIGHT_MODEL,
      request.user_content,
      if request.structured { "json" } else { "text" }
    ));

    // An unparseable cached answer or a failed touch falls through to a fresh call.
    if let Some(response) = cache::get_llm(&cache_key).await?
      && let Ok(value) = request.finalize(&response)
      && cache::touch(&cache_key).await.is_ok()
    {
      span.record("cache_hit", true);
      return Ok(value);
    }
    span.record("cache_hit", false);

    let mut last_error = String::new();
    for attempt in 1..=ASK_LLM_RETRIES {
      span.record("attempts", attempt);
      self.reserve_call()?;
      let raw = match self.call(&request).await {
        Ok(raw) => raw,
        Err(e) => {
          last_error = e.to_string();
          continue;
        }
      };
      if raw.is_empty() {
        // An empty reply is the intended "absent" answer for plain text.
        if !request.structured {
          cache::set_llm(&cache_key, "").await?;
          return Ok(Value::from(""));
        }
        last_error = "empty response".to_string();
        continue;
      }

      let value = match request.finalize(&raw) {
        Ok(x) => x,
        Err(e) => {
          last_error = format!("parse: {e}");
          continue;
        }
      };
      cache::set_llm(&cache_key, &raw).await?;
      return Ok(value);
    }

    Err(DeterministicJsonError::AskLlm(format!(
      "askLlm failed after {ASK_LLM_RETRIES} attempts: {last_error}"
    )))
  }

  fn reserve_call(&self) -> Result<(), DeterministicJsonError> {
    self
      .api_calls
      .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |n| {
        (n < self.max_calls).then_some(n + 1)
      })
      .map(|_| ())
      .map_err(|_| {
        DeterministicJsonError::AskLlm(format!("askLlm call budget exhausted ({})", self.max_calls))
      })
  }

  /// One API call; the trimmed reply text.
  async fn call(&self, request: &Request) -> Result<String, LlmError> {
    let messages = vec![
      ChatMessage::system(ASK_LLM_SYSTEM),
      ChatMessage::user(request.user_content.clone()),
    ];
    let options = ChatOptions::default()
      .with_temperature(0.0)
      .with_max_tokens(ASK_LLM_MAX_TOKENS);
    let response = generate_text(Provider::Groq, &LIGHT_MODEL, messages, options).await?;
    record(
      &self.cost_tracking,
      "askLlm",
      Provider::Groq,
      &LIGHT_MODEL,
      &response,
    );
    Ok(js::trim(&response_text(&response)).to_string())
  }
}

struct Request {
  structured: bool,
  /// A non-object schema: the answer comes back wrapped as `{"value": V}`.
  wrap: bool,
  user_content: String,
}

impl Request {
  fn new(prompt: &str, schema: Option<&Value>) -> Result<Self, DeterministicJsonError> {
    let Some(schema) = schema else {
      return Ok(Self {
        structured: false,
        wrap: false,
        user_content: prompt.to_string(),
      });
    };
    let Value::Object(map) = schema else {
      return Err(DeterministicJsonError::AskLlm(
        "askLlm schema must be a JSON Schema object".to_string(),
      ));
    };
    let wrap = map.get("type").and_then(Value::as_str) != Some("object");
    let user_content = match wrap {
      true => format!(
        "{prompt}\n\nReturn ONLY a JSON object {{\"value\": V}} where V matches this JSON Schema (use null if unknown):\n\n{schema}"
      ),
      false => {
        format!("{prompt}\n\n### JSON Schema (match this shape; use null for unknown)\n\n{schema}")
      }
    };
    Ok(Self {
      structured: true,
      wrap,
      user_content,
    })
  }

  /// The answer as the extractor sees it.
  fn finalize(&self, raw: &str) -> Result<Value, String> {
    if !self.structured {
      return Ok(Value::from(normalize_plain_text(raw)));
    }
    let parsed = parse_json_loose(raw)?;
    let value = match (self.wrap, parsed) {
      (true, Value::Object(mut map)) if map.contains_key("value") => {
        map.remove("value").unwrap_or(Value::Null)
      }
      (_, parsed) => parsed,
    };
    Ok(match value {
      Value::String(s) => Value::from(normalize_plain_text(&s)),
      value => value,
    })
  }
}

fn normalize_plain_text(s: &str) -> &str {
  match js::trim(s).to_ascii_lowercase().as_str() {
    "null" | "none" | "n/a" | "undefined" => "",
    _ => s,
  }
}

fn parse_json_loose(raw: &str) -> Result<Value, String> {
  serde_json::from_str(raw).or_else(|_| {
    let repaired = jsonrepair_rs::jsonrepair(raw).map_err(|e| e.to_string())?;
    serde_json::from_str(&repaired).map_err(|e| e.to_string())
  })
}
