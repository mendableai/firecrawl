//! TS `jev.ts`: branding's decisions answered by TypeSafe's Jev
//! (https://docs.typesafe.ai/api) in one call that returns calibrated
//! probabilities, mapped back onto the enhancement the model call returns.

mod answers;
mod breaker;
mod client;
mod colors;
mod config;
mod fonts;
mod ordered;
mod questions;
mod request;
pub mod shadow;

use serde::Serialize;
use serde_json::{Value, json};
use tracing::{Span, field::Empty, instrument};

use super::super::super::cost_tracking::{CostTracking, CostTrackingTokens};
use super::js;
use super::llm::LlmInput;
use answers::Answers;
use ordered::Ordered;
use questions::Question;
use request::State;

pub use answers::JevBrandingResult;
pub use config::{ESCALATE_BELOW, env_flag, is_jev_branding_enabled};

const JEV_MODEL: &str = "jev-latest";
/// https://docs.typesafe.ai/models (2026-09-28): $0.042 per million input
/// tokens; output tokens are not billed.
const JEV_INPUT_USD_PER_MTOK: f64 = 0.042;

const MAX_LOGOS: usize = 20;
const MAX_BUTTONS: usize = 12;
const NONE: &str = "none";

/// TS `clip`: whitespace collapsed and trimmed, at most `max` UTF-16 units,
/// never half a surrogate pair.
fn clip(value: Option<&str>, max: usize) -> String {
  let mut collapsed = String::new();
  for c in value.unwrap_or_default().chars() {
    if !js::is_space(c) {
      collapsed.push(c);
    } else if !collapsed.ends_with(' ') {
      collapsed.push(' ');
    }
  }
  let mut units = 0;
  js::trim(&collapsed)
    .chars()
    .take_while(|c| {
      units += c.len_utf16();
      units <= max
    })
    .collect()
}

#[derive(Serialize)]
struct Body<'a> {
  model: &'static str,
  state: &'a State,
  questions: &'a Ordered<Question>,
}

/// TS `enhanceBrandingWithJev`. `None` when Jev is off, its breaker is open,
/// the call fails or the answers are unusable, so the caller falls back to the
/// model call.
#[instrument(
  name = "transformers::branding::enhance_branding_with_jev",
  skip_all,
  fields(
    branding.jev.shadow = shadow,
    branding.jev.questions = Empty,
    branding.jev.outcome = Empty,
    branding.jev.breaker_opened = Empty,
    branding.jev.logo_confidence = Empty,
    typesafe.model = Empty,
    typesafe.usage.input_tokens = Empty,
    typesafe.usage.output_tokens = Empty,
    cost = Empty,
  )
)]
pub async fn enhance_branding_with_jev(
  input: &LlmInput<'_>,
  cost_tracking: &CostTracking,
  shadow: bool,
) -> Option<JevBrandingResult> {
  let span = Span::current();
  if config::API_KEY.is_none() || breaker::is_open() {
    span.record("branding.jev.outcome", "skipped");
    return None;
  }
  let request = request::build_jev_request(input);
  span.record("branding.jev.questions", request.questions.0.len());
  let body = Body {
    model: JEV_MODEL,
    state: &request.state,
    questions: &request.questions,
  };
  let Ok(body) = serde_json::to_vec(&body) else {
    span.record("branding.jev.outcome", "unusable");
    return None;
  };
  let mut response = match client::system_one(body).await {
    Ok(response) => response,
    Err(_) => {
      if breaker::record_failure() {
        span.record("branding.jev.breaker_opened", true);
      }
      span.record("branding.jev.outcome", "call_failed");
      return None;
    }
  };
  breaker::record_success();

  let model = response["model"].as_str().unwrap_or_default().to_string();
  let tokens = CostTrackingTokens {
    input: response["usage"]["input_tokens"].as_u64().unwrap_or(0),
    output: response["usage"]["output_tokens"].as_u64().unwrap_or(0),
  };
  let cost = (tokens.input as f64 * JEV_INPUT_USD_PER_MTOK) / 1_000_000.0;
  span.record("typesafe.model", model.as_str());
  span.record("typesafe.usage.input_tokens", tokens.input);
  span.record("typesafe.usage.output_tokens", tokens.output);
  span.record("cost", cost);
  cost_tracking.add_call(
    json!({ "module": "branding", "method": "enhanceBrandingWithJev" }),
    if model.is_empty() { JEV_MODEL } else { &model },
    cost,
    tokens,
  );

  let answers = response.get_mut("answers").map(Value::take);
  let Some(answers) = answers.and_then(|x| serde_json::from_value::<Answers>(x).ok()) else {
    span.record("branding.jev.outcome", "unusable");
    return None;
  };
  let result = answers::map_jev_answers(&request, &model, &answers);
  span.record("branding.jev.outcome", "answered");
  if let Some(confidence) = result.logo_confidence {
    span.record("branding.jev.logo_confidence", confidence);
  }
  Some(result)
}
