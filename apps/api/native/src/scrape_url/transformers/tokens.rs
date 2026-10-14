use tracing::{Span, instrument};

use super::TransformerError;

/// Bounds how much text the tokenizer sees, like TS `MAX_CHARS_PER_TOKEN`.
const MAX_CHARS_PER_TOKEN: usize = 5;

pub struct TrimResult {
  pub text: String,
  pub num_tokens: usize,
  pub warning: Option<String>,
}

/// TS `trimToTokenLimit`: the text cut to `max_tokens` tokens of `model`'s
/// encoding, and a warning when it was cut. Lengths count UTF-16 units, like JS.
#[instrument(
  name = "transformers::tokens::trim_to_token_limit",
  skip(text, previous_warning),
  fields(num_tokens = tracing::field::Empty, trimmed = tracing::field::Empty),
  err
)]
pub async fn trim_to_token_limit(
  text: &str,
  max_tokens: usize,
  model: &str,
  previous_warning: Option<&str>,
) -> Result<TrimResult, TransformerError> {
  let text = text.to_string();
  let model = model.to_string();
  let previous_warning = previous_warning.map(str::to_string);
  let parent = Span::current();
  let result = tokio::task::spawn_blocking(move || {
    let _guard = parent.enter();
    trim(&text, max_tokens, &model, previous_warning.as_deref())
  })
  .await?;
  let span = Span::current();
  span.record("num_tokens", result.num_tokens);
  span.record("trimmed", result.warning.is_some());
  Ok(result)
}

fn trim(text: &str, max_tokens: usize, model: &str, previous_warning: Option<&str>) -> TrimResult {
  let with_previous = |warning: String| match previous_warning {
    Some(previous) => format!("{warning} {previous}"),
    None => warning,
  };

  let max_chars = max_tokens * MAX_CHARS_PER_TOKEN;
  let candidate = utf16_prefix(text, max_chars);
  let pre_trimmed = candidate.len() < text.len();

  // @dqbd/tiktoken throws on special tokens and unknown models; TS then trims by characters.
  let bpe = tiktoken_rs::bpe_for_model(model)
    .ok()
    .filter(|bpe| !bpe.special_tokens().iter().any(|x| candidate.contains(x)));
  let Some(bpe) = bpe else {
    return fallback(text, max_tokens, with_previous);
  };

  let tokens = bpe.encode_ordinary(candidate);
  let num_tokens = tokens.len();
  if num_tokens <= max_tokens && !pre_trimmed {
    return TrimResult {
      text: text.to_string(),
      num_tokens,
      warning: None,
    };
  }

  if num_tokens <= max_tokens {
    return TrimResult {
      text: candidate.to_string(),
      num_tokens,
      warning: Some(with_previous(format!(
        "The extraction content would have used more characters than the maximum we allow ({max_chars}). -- the input has been automatically trimmed."
      ))),
    };
  }

  let Ok(bytes) = bpe.decode_bytes(&tokens[..max_tokens]) else {
    return fallback(text, max_tokens, with_previous);
  };
  let plus = if pre_trimmed { "+" } else { "" };
  TrimResult {
    text: String::from_utf8_lossy(&bytes).into_owned(),
    num_tokens: max_tokens,
    warning: Some(with_previous(format!(
      "The extraction content would have used more tokens ({num_tokens}{plus}) than the maximum we allow ({max_tokens}). -- the input has been automatically trimmed."
    ))),
  }
}

fn fallback(text: &str, max_tokens: usize, with_previous: impl Fn(String) -> String) -> TrimResult {
  let safe_length = (max_tokens as f64 * 2.8).floor() as usize;
  TrimResult {
    text: utf16_prefix(text, safe_length).to_string(),
    num_tokens: max_tokens,
    warning: Some(with_previous(format!(
      "Failed to derive number of LLM tokens the extraction might use -- the input has been automatically trimmed to the maximum number of tokens ({max_tokens}) we support."
    ))),
  }
}

/// The longest prefix of `text` that is at most `max_units` UTF-16 units long.
pub fn utf16_prefix(text: &str, max_units: usize) -> &str {
  let mut units = 0;
  for (index, char) in text.char_indices() {
    units += char.len_utf16();
    if units > max_units {
      return &text[..index];
    }
  }
  text
}
