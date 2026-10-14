//! The providers TS `getModel` picks for query: Gemini on Vertex or the
//! Gemini API, OpenAI, and the Fireworks fine-tune.

use genai::{
  ModelIden, ModelSpec, ServiceTarget,
  adapter::AdapterKind,
  resolver::{AuthData, Endpoint},
};

use super::super::super::llm::model_name_with_override;

/// The OpenAI-compatible API the AI SDK's `fireworks` provider calls.
const FIREWORKS_ENDPOINT: &str = "https://api.fireworks.ai/inference/v1/";

#[derive(Debug, Clone, Copy)]
pub enum Provider {
  /// The Gemini API (TS `google`), keyed by `GOOGLE_GENERATIVE_AI_API_KEY`.
  Google,
  Vertex,
  OpenAI,
  Fireworks,
}

impl Provider {
  /// TS `hasVertex()`: Vertex when its credentials are configured.
  pub fn gemini() -> Self {
    match std::env::var("VERTEX_CREDENTIALS") {
      Ok(x) if !x.is_empty() => Provider::Vertex,
      _ => Provider::Google,
    }
  }

  /// What `llm::exec_chat_spec` runs `model` on, with `MODEL_NAME` applied
  /// like TS `getModel` does. Vertex gets its endpoint and auth from the
  /// shared client.
  pub fn spec(self, model: &str) -> ModelSpec {
    let model = model_name_with_override(model);
    match self {
      Provider::Google => ModelSpec::Target(ServiceTarget {
        endpoint: Endpoint::from_static("https://generativelanguage.googleapis.com/v1beta/"),
        auth: AuthData::from_env("GOOGLE_GENERATIVE_AI_API_KEY"),
        model: ModelIden::new(AdapterKind::Gemini, model),
      }),
      Provider::Vertex => ModelSpec::Iden(ModelIden::new(AdapterKind::Vertex, model)),
      Provider::OpenAI => ModelSpec::Iden(ModelIden::new(AdapterKind::OpenAI, model)),
      // genai's Fireworks adapter sends `max_tokens: 512000`, which the AI
      // SDK doesn't; its OpenAI chat adapter sends the same body as TS.
      Provider::Fireworks => ModelSpec::Target(ServiceTarget {
        endpoint: Endpoint::from_static(FIREWORKS_ENDPOINT),
        auth: AuthData::from_env("FIREWORKS_API_KEY"),
        model: ModelIden::new(AdapterKind::OpenAI, model),
      }),
    }
  }
}
