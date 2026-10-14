//! TS `fitToTokens`, `keepWholeLines` and `escapePromptTags` from
//! `transformers/query.ts`.

use std::sync::LazyLock;

use regex::Regex;
use tracing::{Span, field::Empty, instrument};

use super::super::{TransformerError, tokens::utf16_prefix};

/// TS tokenizes in chunks of this many UTF-16 units. The chunk edges change
/// how the text splits into tokens, so they are kept.
const TOKENIZE_CHUNK_UNITS: usize = 64_000;

static PROMPT_TAGS: LazyLock<Regex> = LazyLock::new(|| {
  // JS `\s`, which has U+FEFF and not U+0085, and ASCII-only `/i` matching.
  Regex::new(
    r"(</?)((?i-u:query|page|lines))([\t\n\x0B\x0C\r \u{a0}\u{1680}\u{2000}-\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}\u{feff}>])",
  )
  .expect("PROMPT_TAGS is a valid static regex pattern")
});

/// Keeps page text from closing or opening the prompt's own tags.
pub fn escape_prompt_tags(text: &str) -> String {
  PROMPT_TAGS
    .replace_all(text, "${1}\u{200b}${2}${3}")
    .into_owned()
}

pub struct Fitted {
  pub text: String,
  pub trimmed: bool,
}

/// TS `fitToTokens`: a prefix of `text` of at most `max_tokens` o200k
/// tokens. Text that fits in bytes skips the tokenizer; text the tokenizer
/// rejects is cut to `max_tokens` bytes, which always fits.
#[instrument(
  name = "transformers::query::fit_to_tokens",
  skip(text),
  fields(bytes = text.len(), trimmed = Empty),
  err
)]
pub async fn fit_to_tokens(text: &str, max_tokens: usize) -> Result<Fitted, TransformerError> {
  if text.len() <= max_tokens {
    Span::current().record("trimmed", false);
    return Ok(Fitted {
      text: text.to_string(),
      trimmed: false,
    });
  }
  let text = text.to_string();
  let parent = Span::current();
  let fitted = tokio::task::spawn_blocking(move || {
    let _guard = parent.enter();
    fit(&text, max_tokens)
  })
  .await?;
  Span::current().record("trimmed", fitted.trimmed);
  Ok(fitted)
}

fn fit(text: &str, max_tokens: usize) -> Fitted {
  let bpe = tiktoken_rs::o200k_base_singleton();
  let mut used = 0;
  let mut start = 0;
  while start < text.len() {
    let rest = &text[start..];
    let prefix = utf16_prefix(rest, TOKENIZE_CHUNK_UNITS);
    let chunk = match prefix.len() < rest.len() {
      // Cut after a newline where possible so no token straddles two chunks.
      true => prefix.rfind('\n').map_or(prefix, |x| &prefix[..=x]),
      false => rest,
    };
    // @dqbd/tiktoken throws on special tokens; TS then cuts by bytes.
    if bpe.special_tokens().iter().any(|x| chunk.contains(x)) {
      return fit_to_bytes(text, max_tokens);
    }
    let tokens = bpe.encode_ordinary(chunk);
    if used + tokens.len() > max_tokens {
      let Ok(bytes) = bpe.decode_bytes(&tokens[..max_tokens - used]) else {
        return fit_to_bytes(text, max_tokens);
      };
      return Fitted {
        text: format!("{}{}", &text[..start], String::from_utf8_lossy(&bytes)),
        trimmed: true,
      };
    }
    used += tokens.len();
    start += chunk.len();
  }
  Fitted {
    text: text.to_string(),
    trimmed: false,
  }
}

/// TS `fitToBytes`: at most `max_bytes` bytes, without a partial last char.
fn fit_to_bytes(text: &str, max_bytes: usize) -> Fitted {
  let bytes = &text.as_bytes()[..max_bytes.min(text.len())];
  let decoded = String::from_utf8_lossy(bytes);
  Fitted {
    text: decoded
      .strip_suffix('\u{fffd}')
      .unwrap_or(&decoded)
      .to_string(),
    trimmed: true,
  }
}

/// TS `keepWholeLines`: drops the partial line a cut left at the end of
/// `prefix`. A line longer than the whole prefix stays cut short.
pub fn keep_whole_lines(text: &str, prefix: &str) -> String {
  let ends_at_line_end = text.starts_with(prefix)
    && (prefix.len() == text.len() || text.as_bytes()[prefix.len()] == b'\n');
  if ends_at_line_end {
    return prefix.to_string();
  }
  match prefix.rfind('\n') {
    Some(x) => prefix[..x].to_string(),
    None => prefix.to_string(),
  }
}
