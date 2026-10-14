use genai::chat::{ChatMessage, ChatRequest};
use serde_json::Value;
use tracing::instrument;

use super::super::super::{
  cost_tracking::calculate_cost,
  llm::{self, LlmError},
  meta::Meta,
};
use super::generate::with_details;

fn strip_code_fences(text: &str) -> Option<String> {
  let trimmed = text.trim();
  if !trimmed.starts_with("```") {
    return None;
  }

  let body = match trimmed.strip_prefix("```json") {
    Some(rest) => rest.trim(),
    None => trimmed[3..].trim(),
  };

  match body.strip_suffix("```") {
    Some(rest) => Some(rest.trim().to_string()),
    None => Some(body.to_string()),
  }
}

#[instrument(name = "transformers::json::repair_json", skip_all, err)]
async fn repair_json(
  meta: &Meta,
  cost_metadata: &Value,
  text: &str,
  error: &serde_json::Error,
  model: &str,
) -> Result<String, LlmError> {
  let chat_req = ChatRequest::new(vec![
    ChatMessage::system(
      "You are a JSON repair expert. Your only job is to fix malformed JSON and return valid JSON that matches the original structure and intent as closely as possible. Do not include any explanation or commentary - only return the fixed JSON. Do not return it in a Markdown code block, just plain JSON.",
    ),
    ChatMessage::user(format!(
      "Fix this JSON that had the following error: {error}\n\nOriginal text:\n{text}\n\nReturn only the fixed JSON, no explanation."
    )),
  ]);

  let response = llm::client()?
    .exec_chat(model, chat_req, None)
    .await
    .map_err(llm::classify_error)?;

  let tokens = llm::usage_tokens(&response.usage);
  meta.cost_tracking.add_call(
    with_details(cost_metadata, "repairConfig", None),
    model,
    calculate_cost(model, tokens.input, tokens.output),
    tokens,
  );

  Ok(response.first_text().unwrap_or_default().to_string())
}

pub(super) async fn parse_llm_json(
  meta: &Meta,
  cost_metadata: &Value,
  text: &str,
  model: &str,
) -> Result<Value, LlmError> {
  match serde_json::from_str(text) {
    Ok(x) => Ok(x),
    Err(parse_error) => {
      if let Some(unfenced) = strip_code_fences(text)
        && let Ok(x) = serde_json::from_str(&unfenced)
      {
        return Ok(x);
      }

      let repaired = repair_json(meta, cost_metadata, text, &parse_error, model).await?;
      let repaired = strip_code_fences(&repaired).unwrap_or(repaired);
      serde_json::from_str(&repaired).map_err(|e| LlmError::InvalidJson(e.to_string()))
    }
  }
}
