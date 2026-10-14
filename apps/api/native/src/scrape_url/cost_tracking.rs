//! Port of TS `CostTracking` (lib/cost-tracking.ts): the LLM calls a scrape
//! made, returned with its result so the worker can save them.

use std::{panic::Location, sync::Mutex};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use serde_with::skip_serializing_none;
use ts_rs::TS;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum CostTrackingCallType {
  Other,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS)]
pub struct CostTrackingTokens {
  pub input: u64,
  pub output: u64,
}

#[skip_serializing_none]
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(optional_fields)]
pub struct CostTrackingCall {
  #[serde(rename = "type")]
  pub kind: CostTrackingCallType,
  #[ts(type = "Record<string, unknown>")]
  pub metadata: Value,
  pub cost: f64,
  pub model: String,
  pub tokens: Option<CostTrackingTokens>,
  /// Where the call was recorded; TS records a JS stack here.
  pub stack: String,
}

/// TS `CostTracking.toJSON()`, the shape the worker writes to `cost_tracking`.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename = "CostTracking")]
pub struct CostTrackingJson {
  pub calls: Vec<CostTrackingCall>,
  pub smart_scrape_call_count: u32,
  pub smart_scrape_cost: f64,
  pub other_call_count: u32,
  pub other_cost: f64,
  pub total_cost: f64,
}

#[derive(Debug, Default)]
pub struct CostTracking {
  calls: Mutex<Vec<CostTrackingCall>>,
}

impl CostTracking {
  #[track_caller]
  pub fn add_call(&self, metadata: Value, model: &str, cost: f64, tokens: CostTrackingTokens) {
    let call = CostTrackingCall {
      kind: CostTrackingCallType::Other,
      metadata,
      cost,
      model: model.to_string(),
      tokens: Some(tokens),
      stack: Location::caller().to_string(),
    };
    self
      .calls
      .lock()
      .unwrap_or_else(|e| e.into_inner())
      .push(call);
  }

  pub fn to_json(&self) -> CostTrackingJson {
    let calls = self.calls.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let total_cost = calls.iter().map(|x| x.cost).sum();
    CostTrackingJson {
      smart_scrape_call_count: 0,
      smart_scrape_cost: 0.0,
      other_call_count: u32::try_from(calls.len()).unwrap_or(u32::MAX),
      other_cost: total_cost,
      total_cost,
      calls,
    }
  }
}

/// USD per million tokens, like TS `modelCosts`.
const MODEL_COSTS: &[(&str, f64, f64)] = &[
  ("gpt-4o-mini", 0.15, 0.6),
  ("gpt-4o", 2.5, 10.0),
  ("gpt-4.1", 2.0, 8.0),
  ("gpt-4.1-mini", 0.4, 1.6),
  ("o3-mini", 1.1, 4.4),
  ("gpt-5", 1.25, 10.0),
  ("gpt-5-mini", 0.25, 2.0),
  ("gpt-5-nano", 0.05, 0.4),
  ("google/gemini-2.0-flash-001", 0.15, 0.6),
  ("gemini-2.0-flash", 0.15, 0.6),
  ("gemini-2.5-flash-lite", 0.1, 0.4),
  ("grok-4-1-fast-non-reasoning", 0.2, 0.5),
  ("deepseek/deepseek-r1", 0.55, 2.19),
  ("google/gemini-2.0-flash-thinking-exp:free", 0.55, 2.19),
];

/// The limits TS `modelPrices` gives the models Rust calls.
pub struct ModelPrice {
  pub max_input_tokens: u64,
  pub max_output_tokens: u64,
}

pub fn model_price(model: &str) -> Option<ModelPrice> {
  let (max_input_tokens, max_output_tokens) = match model {
    "gpt-4o-mini" | "gpt-4o" => (128000, 16384),
    "gpt-4.1" | "gpt-4.1-mini" => (1047576, 32768),
    _ => return None,
  };
  Some(ModelPrice {
    max_input_tokens,
    max_output_tokens,
  })
}

fn lookup_model_cost(model: &str) -> Option<(f64, f64)> {
  let mut candidates = vec![model];
  if let Some((_, bare)) = model.split_once('/') {
    candidates.push(bare);
  }
  candidates.iter().find_map(|id| {
    MODEL_COSTS
      .iter()
      .find(|(name, ..)| name == id)
      .map(|(_, input, output)| (*input, *output))
  })
}

/// TS `calculateCost`. A model outside [`MODEL_COSTS`] costs 0; TS's fallback
/// to its full `modelPrices` table only prices `MODEL_NAME` overrides.
pub fn calculate_cost(model: &str, input_tokens: u64, output_tokens: u64) -> f64 {
  let cost = if model.contains("gemini-2.5-pro") {
    Some(if input_tokens <= 200_000 {
      (1.25, 10.0)
    } else {
      (2.5, 15.0)
    })
  } else {
    lookup_model_cost(model)
  };
  let Some((input_cost, output_cost)) = cost else {
    return 0.0;
  };
  (input_tokens as f64 * input_cost + output_tokens as f64 * output_cost) / 1_000_000.0
}
