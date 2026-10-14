use std::sync::LazyLock;
use std::time::Duration;

use base64::Engine;

use genai::Client;
use genai::ServiceTarget;
use genai::adapter::AdapterKind;
use genai::chat::{ChatOptions, ChatRequest, ChatResponse, Usage};
use genai::resolver::{AuthData, AuthResolver, Endpoint};
use genai::{ModelIden, resolver};
use google_cloud_auth::credentials::{AccessTokenCredentials, service_account};
use tokio::sync::OnceCell;
use tracing::{Span, field::Empty, instrument};

use super::cost_tracking::CostTrackingTokens;

static LLM_CLIENT: LazyLock<Result<Client, genai::Error>> = LazyLock::new(|| {
  let openai_base_url = std::env::var("OPENAI_BASE_URL")
    .ok()
    .filter(|x| !x.is_empty());
  let ollama_base_url = std::env::var("OLLAMA_BASE_URL")
    .ok()
    .filter(|x| !x.is_empty());
  let vertex_base_url = Some(VERTEX_BASE_URL.to_string());

  Client::builder()
    .with_auth_resolver(AuthResolver::from_resolver_async_fn(vertex_auth))
    .with_service_target_resolver_fn(move |target: ServiceTarget| {
      let base_url = match target.model.adapter_kind {
        AdapterKind::OpenAI => &openai_base_url,
        AdapterKind::Ollama => &ollama_base_url,
        AdapterKind::Vertex => &vertex_base_url,
        _ => &None,
      };
      Ok(match base_url {
        Some(base_url) => ServiceTarget {
          endpoint: Endpoint::from_owned(base_url.clone()),
          ..target
        },
        None => target,
      })
    })
    .build()
});

/// TS `getModel`'s Vertex provider: project `firecrawl`, location `global`.
const VERTEX_BASE_URL: &str =
  "https://aiplatform.googleapis.com/v1/projects/firecrawl/locations/global/";

static VERTEX_CREDENTIALS: OnceCell<AccessTokenCredentials> = OnceCell::const_new();

/// TS's `googleAuthOptions`: the base64 service account in `VERTEX_CREDENTIALS`,
/// else the `./gke-key.json` key file.
async fn vertex_credentials() -> Result<&'static AccessTokenCredentials, String> {
  VERTEX_CREDENTIALS
    .get_or_try_init(|| async {
      let key = match std::env::var("VERTEX_CREDENTIALS")
        .ok()
        .filter(|x| !x.is_empty())
      {
        Some(encoded) => base64::engine::general_purpose::STANDARD
          .decode(encoded.trim())
          .map_err(|e| e.to_string())?,
        None => tokio::fs::read("./gke-key.json")
          .await
          .map_err(|e| e.to_string())?,
      };
      let key = serde_json::from_slice(&key).map_err(|e| e.to_string())?;
      service_account::Builder::new(key)
        .with_access_specifier(service_account::AccessSpecifier::from_scopes([
          "https://www.googleapis.com/auth/cloud-platform",
        ]))
        .build_access_token_credentials()
        .map_err(|e| e.to_string())
    })
    .await
}

fn vertex_auth(
  model: ModelIden,
) -> std::pin::Pin<Box<dyn Future<Output = resolver::Result<Option<AuthData>>> + Send>> {
  Box::pin(async move {
    if model.adapter_kind != AdapterKind::Vertex {
      return Ok(None);
    }
    // Own task, like the GCS client calls (FIRE-86).
    let token = tokio::spawn(async {
      let credentials = vertex_credentials().await?;
      credentials.access_token().await.map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(Some(AuthData::from_single(token.token)))
  })
}

#[derive(Debug, thiserror::Error)]
pub enum LlmError {
  #[error("failed to build LLM client: {0}")]
  ClientBuild(String),

  #[error("LLM refused to extract the website's content")]
  Refusal,

  #[error("LLM output failed to parse as JSON: {0}")]
  InvalidJson(String),

  #[error(
    "the extracted data exceeded the model's maximum output length, so nothing was returned. Try a schema or prompt that asks for fewer items."
  )]
  OutputLimit,

  #[error("Failed to generate schema after all attempts. Last error: {0}")]
  SchemaGeneration(String),

  #[error(transparent)]
  Genai(genai::Error),

  #[error("Failed after {attempts} attempts. Last error: {last}")]
  RetriesExhausted { attempts: u32, last: Box<LlmError> },

  #[error("Failed after {attempts} attempts with non-retryable error: '{last}'")]
  NotRetryable { attempts: u32, last: Box<LlmError> },
}

pub fn client() -> Result<&'static Client, LlmError> {
  LLM_CLIENT
    .as_ref()
    .map_err(|e| LlmError::ClientBuild(e.to_string()))
}

pub fn model_name_with_override(default: &str) -> String {
  match std::env::var("MODEL_NAME") {
    Ok(x) if !x.is_empty() => x,
    _ => default.to_string(),
  }
}

pub fn is_quota_error(e: &LlmError) -> bool {
  let status = match e {
    LlmError::Genai(e) => e.status(),
    LlmError::RetriesExhausted { last, .. } | LlmError::NotRetryable { last, .. } => {
      return is_quota_error(last);
    }
    _ => None,
  };
  if status.is_some_and(|s| s.as_u16() == 429) {
    return true;
  }
  let message = e.to_string();
  message.contains("Quota exceeded")
    || message.contains("exceeded your current quota")
    || message.contains("rate limit")
}

pub fn usage_tokens(usage: &Usage) -> CostTrackingTokens {
  let count = |x: Option<i32>| u64::try_from(x.unwrap_or(0)).unwrap_or(0);
  CostTrackingTokens {
    input: count(usage.prompt_tokens),
    output: count(usage.completion_tokens),
  }
}

pub fn classify_error(e: genai::Error) -> LlmError {
  if e.to_string().contains("refused") {
    LlmError::Refusal
  } else {
    LlmError::Genai(e)
  }
}

/// The AI SDK's retries around a model call: up to two more attempts on a
/// retryable error, 2s then 4s apart unless the provider asks for a delay.
#[instrument(name = "llm::exec_chat", skip(chat_req, options), fields(attempts = Empty), err)]
pub async fn exec_chat(
  model: &str,
  chat_req: ChatRequest,
  options: Option<&ChatOptions>,
) -> Result<ChatResponse, LlmError> {
  const MAX_RETRIES: u32 = 2;
  let client = client()?;
  let mut delay = Duration::from_secs(2);
  let mut attempts = 0;
  let result = loop {
    attempts += 1;
    let error = match client.exec_chat(model, chat_req.clone(), options).await {
      Ok(x) => break Ok(x),
      Err(e) => e,
    };
    let retry_after = retry_delay(&error, delay);
    let last = Box::new(classify_error(error));
    if attempts > MAX_RETRIES {
      break Err(LlmError::RetriesExhausted { attempts, last });
    }
    let Some(retry_after) = retry_after else {
      break Err(match attempts {
        1 => *last,
        _ => LlmError::NotRetryable { attempts, last },
      });
    };
    tokio::time::sleep(retry_after).await;
    delay *= 2;
  };
  Span::current().record("attempts", attempts);
  result
}

/// How long to wait before retrying, or `None` when the AI SDK wouldn't retry.
/// Honors `retry-after-ms` and `retry-after` under a minute.
fn retry_delay(error: &genai::Error, backoff: Duration) -> Option<Duration> {
  use genai::webc::Error as WebError;
  let retryable = match error.status() {
    Some(status) => matches!(status.as_u16(), 408 | 409 | 429) || status.is_server_error(),
    None => matches!(
      error,
      genai::Error::WebModelCall {
        webc_error: WebError::Reqwest(_),
        ..
      } | genai::Error::WebAdapterCall {
        webc_error: WebError::Reqwest(_),
        ..
      }
    ),
  };
  if !retryable {
    return None;
  }

  let header = |name| error.headers()?.get(name)?.to_str().ok();
  let parse = |x: &str| x.trim().parse::<f64>().ok();
  let ms = match (
    header("retry-after-ms").and_then(parse),
    header("retry-after"),
  ) {
    (Some(ms), _) => Some(ms),
    (None, Some(after)) => parse(after).map(|x| x * 1000.0).or_else(|| {
      let date = chrono::DateTime::parse_from_rfc2822(after.trim()).ok()?;
      Some((date.timestamp_millis() - chrono::Utc::now().timestamp_millis()) as f64)
    }),
    (None, None) => None,
  };
  let backoff_ms = backoff.as_millis() as f64;
  Some(match ms {
    Some(ms) if ms >= 0.0 && (ms < 60_000.0 || ms < backoff_ms) => {
      Duration::from_secs_f64(ms / 1000.0)
    }
    _ => backoff,
  })
}
