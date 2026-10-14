use std::sync::LazyLock;
use std::time::Duration;

use genai::Client;
use genai::ModelSpec;
use genai::ServiceTarget;
use genai::adapter::AdapterKind;
use genai::chat::{ChatOptions, ChatRequest, ChatResponse, Usage};
use genai::resolver::Endpoint;
use tracing::{Span, field::Empty, instrument};

use super::cost_tracking::CostTrackingTokens;

/// genai's default OpenAI endpoint, which `OPENAI_BASE_URL` replaces.
const OPENAI_ENDPOINT: &str = "https://api.openai.com/v1/";

static LLM_CLIENT: LazyLock<Result<Client, genai::Error>> = LazyLock::new(|| {
  let openai_base_url = std::env::var("OPENAI_BASE_URL")
    .ok()
    .filter(|x| !x.is_empty());
  let ollama_base_url = std::env::var("OLLAMA_BASE_URL")
    .ok()
    .filter(|x| !x.is_empty());

  Client::builder()
    .with_service_target_resolver_fn(move |target: ServiceTarget| {
      let base_url = match target.model.adapter_kind {
        // A target that names another OpenAI-compatible service keeps it.
        AdapterKind::OpenAI if target.endpoint.base_url() != OPENAI_ENDPOINT => &None,
        AdapterKind::OpenAI => &openai_base_url,
        AdapterKind::Ollama => &ollama_base_url,
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
  exec_with_retries(ModelSpec::from(model), chat_req, options).await
}

/// [`exec_chat`] on a provider `model`'s name doesn't pick, like Gemini on
/// Vertex or a fine-tune on Fireworks.
#[instrument(name = "llm::exec_chat", skip(spec, chat_req, options), fields(attempts = Empty), err)]
pub async fn exec_chat_spec(
  model: &str,
  spec: ModelSpec,
  chat_req: ChatRequest,
  options: Option<&ChatOptions>,
) -> Result<ChatResponse, LlmError> {
  exec_with_retries(spec, chat_req, options).await
}

async fn exec_with_retries(
  model: ModelSpec,
  chat_req: ChatRequest,
  options: Option<&ChatOptions>,
) -> Result<ChatResponse, LlmError> {
  const MAX_RETRIES: u32 = 2;
  let client = client()?;
  let mut delay = Duration::from_secs(2);
  let mut attempts = 0;
  let result = loop {
    attempts += 1;
    let error = match client
      .exec_chat(model.clone(), chat_req.clone(), options)
      .await
    {
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
