//! TS `llm/client.ts` minus `makeAskLlm`: the codegen and anchor-picker calls
//! and their cost entries.

use std::sync::{Arc, LazyLock};

use genai::chat::{ChatMessage, ChatOptions, ChatRequest, ChatResponse, StopReason};
use regex::Regex;
use serde_json::{Value, json};
use tracing::{Span, field::Empty, instrument};

use super::super::super::{
  cost_tracking::CostTracking,
  llm::{self, LlmError},
};
use super::{
  DeterministicJsonError,
  config::{ANCHOR_MODEL, ANCHOR_PICKER_MAX_TOKENS, CODEGEN_MAX_TOKENS, CODEGEN_MODEL},
  js,
};

/// The AI SDK providers TS calls through `getModel(name, provider)`.
#[derive(Clone, Copy)]
pub enum Provider {
  Vertex,
  Groq,
}

impl Provider {
  fn name(self) -> &'static str {
    match self {
      Provider::Vertex => "vertex",
      Provider::Groq => "groq",
    }
  }
}

/// One `generateText` call. `MODEL_NAME` overrides the model like TS `getModel`.
pub async fn generate_text(
  provider: Provider,
  model: &str,
  messages: Vec<ChatMessage>,
  options: ChatOptions,
) -> Result<ChatResponse, LlmError> {
  let model = format!(
    "{}::{}",
    provider.name(),
    llm::model_name_with_override(model)
  );
  llm::exec_chat(&model, ChatRequest::new(messages), Some(&options)).await
}

/// AI SDK `result.text`: every text part.
pub fn response_text(response: &ChatResponse) -> String {
  response.texts().concat()
}

/// TS `modelPrices` rows (USD per input and output token) for the models
/// this pipeline calls.
const PRICES: &[(&str, f64, f64)] = &[
  ("vertex/gemini-3.1-flash-lite", 2.5e-7, 1.5e-6),
  ("groq/openai/gpt-oss-120b", 1.5e-7, 6e-7),
  ("groq/openai/gpt-oss-20b", 7.5e-8, 3e-7),
];

/// TS `record`: priced from TS's `modelPrices` row for `${provider}/${model}`.
pub fn record(
  cost_tracking: &CostTracking,
  role: &str,
  provider: Provider,
  model: &str,
  response: &ChatResponse,
) {
  let tokens = llm::usage_tokens(&response.usage);
  let key = format!("{}/{model}", provider.name());
  let cost = PRICES
    .iter()
    .find(|(name, ..)| *name == key)
    .map_or(0.0, |(_, input, output)| {
      tokens.input as f64 * input + tokens.output as f64 * output
    });
  let span = Span::current();
  span.record("tokens.input", tokens.input);
  span.record("tokens.output", tokens.output);
  cost_tracking.add_call(
    json!({ "module": "deterministic-json", "role": role }),
    &key,
    cost,
    tokens,
  );
}

pub struct Generation {
  pub content: String,
  pub truncated: bool,
}

/// TS `generateCode`.
#[instrument(
  name = "deterministic_json::generate_code",
  skip_all,
  fields(tokens.input = Empty, tokens.output = Empty, truncated = Empty),
  err
)]
pub async fn generate_code(
  messages: Vec<ChatMessage>,
  cost_tracking: &CostTracking,
) -> Result<Generation, DeterministicJsonError> {
  // Google recommends keeping temperature at 1 for complex tasks.
  let options = ChatOptions::default()
    .with_temperature(1.0)
    .with_max_tokens(CODEGEN_MAX_TOKENS);
  let response = generate_text(Provider::Vertex, &CODEGEN_MODEL, messages, options)
    .await
    .map_err(DeterministicJsonError::Codegen)?;
  record(
    cost_tracking,
    "codegen",
    Provider::Vertex,
    &CODEGEN_MODEL,
    &response,
  );
  let truncated = matches!(response.stop_reason, Some(StopReason::MaxTokens(_)));
  Span::current().record("truncated", truncated);
  Ok(Generation {
    content: response_text(&response),
    truncated,
  })
}

/// TS `pickSnippets`.
#[instrument(
  name = "deterministic_json::pick_snippets",
  skip_all,
  fields(tokens.input = Empty, tokens.output = Empty),
  err
)]
pub async fn pick_snippets(
  messages: Vec<ChatMessage>,
  cost_tracking: &Arc<CostTracking>,
) -> Result<Vec<String>, DeterministicJsonError> {
  let options = ChatOptions::default()
    .with_temperature(0.0)
    .with_max_tokens(ANCHOR_PICKER_MAX_TOKENS);
  let response = generate_text(Provider::Groq, &ANCHOR_MODEL, messages, options)
    .await
    .map_err(DeterministicJsonError::AnchorPicker)?;
  record(
    cost_tracking,
    "anchor",
    Provider::Groq,
    &ANCHOR_MODEL,
    &response,
  );
  Ok(parse_snippets(js::trim(&response_text(&response))))
}

static FENCE_OPEN: LazyLock<Regex> = LazyLock::new(|| {
  Regex::new(&format!("^```(?i-u:json)?{}*", js::SPACE_CLASS)).expect("static regex")
});
static FENCE_CLOSE: LazyLock<Regex> =
  LazyLock::new(|| Regex::new(&format!("```{}*$", js::SPACE_CLASS)).expect("static regex"));

fn parse_snippets(raw: &str) -> Vec<String> {
  let unfenced = FENCE_OPEN.replace(raw, "");
  let unfenced = FENCE_CLOSE.replace(&unfenced, "");
  let Ok(repaired) = jsonrepair_rs::jsonrepair(js::trim(&unfenced)) else {
    return Vec::new();
  };
  let Ok(value) = serde_json::from_str::<Value>(&repaired) else {
    return Vec::new();
  };
  let list = match value {
    Value::Array(list) => list,
    Value::Object(mut map) => match map.remove("snippets") {
      Some(Value::Array(list)) => list,
      _ => return Vec::new(),
    },
    _ => return Vec::new(),
  };
  list
    .into_iter()
    .filter_map(|x| match x {
      Value::String(s) => Some(s),
      _ => None,
    })
    .collect()
}
