use std::borrow::Cow;

use serde::Deserialize;
use url::Url;

use super::super::super::raw_page::BrowserCookie;

#[derive(Deserialize)]
#[serde(untagged)]
pub enum FireEngineActionResultScrape {
  Html { html: String },
  Accessibility { accessibility: String },
}

#[derive(Deserialize)]
#[serde(tag = "type", content = "result", rename_all = "camelCase")]
pub enum FireEngineActionResultKind {
  Screenshot {
    path: Url,
  },
  Scrape {
    url: String,
    #[serde(flatten)]
    scrape: FireEngineActionResultScrape,
  },
  ExecuteJavascript {
    r#return: String,
  },
  Pdf {
    link: Url,
  },
  GetCookies {
    cookies: Vec<BrowserCookie>,
  },
}

#[derive(Deserialize)]
pub struct FireEngineActionResult {
  pub idx: usize,

  #[serde(flatten)]
  pub kind: FireEngineActionResultKind,
}

/// Parses an `executeJavascript` return after [`replace_lone_surrogates`],
/// recording `javascript_return.lone_surrogates` on the current span.
pub fn parse_javascript_return(raw: &str) -> serde_json::Result<serde_json::Value> {
  let raw = replace_lone_surrogates(raw);
  if matches!(raw, Cow::Owned(_)) {
    tracing::Span::current().record("javascript_return.lone_surrogates", true);
  }
  serde_json::from_str(&raw)
}

/// Rewrites `\uD800`-`\uDFFF` escapes that are not half of a surrogate pair to
/// `\ufffd`. JS writes them for text cut inside a pair; serde_json rejects them.
fn replace_lone_surrogates(raw: &str) -> Cow<'_, str> {
  let bytes = raw.as_bytes();
  let unit_at = |i: usize| -> Option<u16> {
    let hex = raw.get(i + 2..i + 6)?;
    (bytes.get(i) == Some(&b'\\') && bytes.get(i + 1) == Some(&b'u'))
      .then(|| u16::from_str_radix(hex, 16).ok())
      .flatten()
  };

  let mut out = String::new();
  let mut copied = 0;
  let mut i = 0;
  while i < bytes.len() {
    if bytes[i] != b'\\' {
      i += 1;
      continue;
    }
    let Some(unit) = unit_at(i) else {
      i += 2;
      continue;
    };
    let lone = match unit {
      0xD800..=0xDBFF => {
        if unit_at(i + 6).is_some_and(|next| (0xDC00..=0xDFFF).contains(&next)) {
          i += 12;
          continue;
        }
        true
      }
      0xDC00..=0xDFFF => true,
      _ => false,
    };
    if lone {
      out.push_str(&raw[copied..i]);
      out.push_str("\\ufffd");
      copied = i + 6;
    }
    i += 6;
  }

  if copied == 0 {
    return Cow::Borrowed(raw);
  }
  out.push_str(&raw[copied..]);
  Cow::Owned(out)
}
