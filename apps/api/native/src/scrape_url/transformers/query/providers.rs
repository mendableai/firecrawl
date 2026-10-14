//! The providers TS `getModel` picks for query: Gemini on Vertex or the
//! Gemini API, OpenAI, and the Fireworks fine-tune.

use genai::{
  ModelIden, ModelSpec, ServiceTarget,
  adapter::AdapterKind,
  resolver::{AuthData, Endpoint},
};
use google_cloud_auth::credentials::{AccessTokenCredentials, service_account};
use serde_json::Value;
use tokio::sync::OnceCell;

use super::super::super::llm::{LlmError, model_name_with_override};

/// TS pins Vertex to this project and location.
const VERTEX_ENDPOINT: &str =
  "https://aiplatform.googleapis.com/v1/projects/firecrawl/locations/global/";

/// The OpenAI-compatible API the AI SDK's `fireworks` provider calls.
const FIREWORKS_ENDPOINT: &str = "https://api.fireworks.ai/inference/v1/";

static VERTEX_CREDENTIALS: OnceCell<Result<AccessTokenCredentials, String>> = OnceCell::const_new();

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
  /// like TS `getModel` does.
  pub async fn spec(self, model: &str) -> Result<ModelSpec, LlmError> {
    let model = model_name_with_override(model);
    Ok(match self {
      Provider::Google => ModelSpec::Target(ServiceTarget {
        endpoint: Endpoint::from_static("https://generativelanguage.googleapis.com/v1beta/"),
        auth: AuthData::from_env("GOOGLE_GENERATIVE_AI_API_KEY"),
        model: ModelIden::new(AdapterKind::Gemini, model),
      }),
      Provider::Vertex => ModelSpec::Target(ServiceTarget {
        endpoint: Endpoint::from_static(VERTEX_ENDPOINT),
        auth: AuthData::from_single(vertex_token().await?),
        model: ModelIden::new(AdapterKind::Vertex, model),
      }),
      Provider::OpenAI => ModelSpec::Iden(ModelIden::new(AdapterKind::OpenAI, model)),
      // genai's Fireworks adapter sends `max_tokens: 512000`, which the AI
      // SDK doesn't; its OpenAI chat adapter sends the same body as TS.
      Provider::Fireworks => ModelSpec::Target(ServiceTarget {
        endpoint: Endpoint::from_static(FIREWORKS_ENDPOINT),
        auth: AuthData::from_env("FIREWORKS_API_KEY"),
        model: ModelIden::new(AdapterKind::OpenAI, model),
      }),
    })
  }
}

/// An OAuth token for the service account TS's Vertex provider uses: the
/// base64 JSON key in `VERTEX_CREDENTIALS`, else `./gke-key.json`.
async fn vertex_token() -> Result<String, LlmError> {
  let credentials = VERTEX_CREDENTIALS
    .get_or_init(|| async { vertex_credentials().await })
    .await
    .as_ref()
    .map_err(|e| LlmError::ClientBuild(format!("Vertex credentials: {e}")))?;
  let token = credentials
    .access_token()
    .await
    .map_err(|e| LlmError::ClientBuild(format!("Vertex access token: {e}")))?;
  Ok(token.token)
}

async fn vertex_credentials() -> Result<AccessTokenCredentials, String> {
  use base64::Engine;
  let key = match std::env::var("VERTEX_CREDENTIALS") {
    Ok(x) if !x.is_empty() => base64::engine::general_purpose::STANDARD
      .decode(x.trim())
      .map_err(|e| e.to_string())?,
    _ => tokio::fs::read("./gke-key.json")
      .await
      .map_err(|e| e.to_string())?,
  };
  let key: Value = serde_json::from_slice(&key).map_err(|e| e.to_string())?;
  service_account::Builder::new(key)
    .build_access_token_credentials()
    .map_err(|e| e.to_string())
}
