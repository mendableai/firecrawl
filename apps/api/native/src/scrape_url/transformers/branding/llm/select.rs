//! What the transformer shows the model besides the page's own profile: the
//! most relevant buttons, and the header HTML when no logo was found.

use std::sync::LazyLock;

use regex::Regex;

use super::super::js;
use super::super::profile::ButtonSnapshot;

const MAX_BUTTONS: usize = 12;
const MAX_HEADER_CHUNK_UNITS: usize = 5500;
const PRIMARY_CTA: [&str; 10] = [
  "get started",
  "sign up",
  "sign in",
  "login",
  "register",
  "read",
  "learn",
  "download",
  "buy",
  "shop",
];
const SECONDARY_CTA: [&str; 4] = ["try", "start", "view", "explore"];

/// TS's `/transparent|white|#fff|#ffffff|gray|grey|#f[0-9a-f]{5}/i`.
fn is_muted(background: &str) -> bool {
  let lower = background.to_ascii_lowercase();
  let pale_hex = lower.match_indices("#f").any(|(i, _)| {
    lower[i + 2..]
      .bytes()
      .take(5)
      .filter(u8::is_ascii_hexdigit)
      .count()
      == 5
  });
  pale_hex
    || ["transparent", "white", "#fff", "gray", "grey"]
      .iter()
      .any(|x| lower.contains(x))
}

fn button_score(button: &ButtonSnapshot) -> i64 {
  let text = button.text.to_lowercase();
  let mut score = 0;
  if PRIMARY_CTA.iter().any(|x| text.contains(x)) {
    score += 100;
  }
  if SECONDARY_CTA.iter().any(|x| text.contains(x)) {
    score += 50;
  }
  if !button.background.is_empty() && !is_muted(&button.background) {
    score += 30;
  }
  if button.top.is_some_and(|top| top < 1000) {
    score += 40;
  }
  score
}

/// The indices of the buttons the model sees: all of them, or the twelve
/// most CTA-like when there are more.
pub fn limit_buttons(buttons: &[ButtonSnapshot]) -> Vec<usize> {
  if buttons.len() <= MAX_BUTTONS {
    return (0..buttons.len()).collect();
  }
  let mut scored: Vec<(usize, i64)> = buttons
    .iter()
    .enumerate()
    .map(|(i, b)| (i, button_score(b)))
    .collect();
  scored.sort_by_key(|(_, score)| std::cmp::Reverse(*score));
  scored
    .into_iter()
    .take(MAX_BUTTONS)
    .map(|(i, _)| i)
    .collect()
}

/// TS `stripNoise`'s patterns, applied in order: comments, scripts, styles.
static NOISE: LazyLock<Vec<Regex>> = LazyLock::new(|| {
  [
    r"<!--(?s:.)*?-->",
    r"(?i-u:<script)(?-u:\b)(?s:.)*?(?i-u:</script>)",
    r"(?i-u:<style)(?-u:\b)(?s:.)*?(?i-u:</style>)",
  ]
  .iter()
  .filter_map(|x| Regex::new(x).ok())
  .collect()
});

fn strip_noise(html: &str) -> String {
  NOISE.iter().fold(html.to_string(), |html, re| {
    re.replace_all(&html, "").into_owned()
  })
}

/// TS `extractHeaderHtmlChunk`: up to 5,500 UTF-16 units from the first
/// `<header`, `<nav` or `<body`, without scripts, styles and comments.
pub fn header_html_chunk(html: &str) -> String {
  let stripped = strip_noise(html);
  let lower = stripped.to_lowercase();
  let start = ["<header", "<nav", "<body"]
    .iter()
    .filter_map(|tag| lower.find(tag).map(|i| js::len(&lower[..i])))
    .min()
    .unwrap_or(0);
  let chunk = js::slice_utf16(&stripped, start, start + MAX_HEADER_CHUNK_UNITS);
  js::split_spaces(&chunk)
    .into_iter()
    .filter(|x| !x.is_empty())
    .collect::<Vec<_>>()
    .join(" ")
}
