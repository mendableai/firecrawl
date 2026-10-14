//! TS `html/selector-repair.ts`: selectors that match nothing only because a
//! child combinator is too strict, so the model can be told what to fix.

use std::sync::LazyLock;

use super::{dom, js};

pub struct TooStrictSelector {
  selector: String,
  loosened: String,
  count: usize,
}

// JS's `.` excludes these line terminators, and the pattern needs the
// backreference and lookahead that only fancy-regex has.
static SELECTOR_CALL: LazyLock<fancy_regex::Regex> = LazyLock::new(|| {
  let dot = r"[^\n\r\x{2028}\x{2029}]";
  fancy_regex::Regex::new(&format!(
    r#"querySelector(?:All)?\({}*(['"`])((?:\\{dot}|(?!\1){dot})*)\1"#,
    js::SPACE_CLASS
  ))
  .expect("static regex")
});

/// Literal selectors passed to `querySelector`/`querySelectorAll`, skipping
/// template literals with interpolation.
fn extract_selector_literals(code: &str) -> Vec<String> {
  let mut out: Vec<String> = Vec::new();
  for captures in SELECTOR_CALL.captures_iter(code).map_while(Result::ok) {
    let Some(selector) = captures.get(2).map(|x| x.as_str()) else {
      continue;
    };
    if !selector.is_empty() && !selector.contains("${") && !out.iter().any(|x| x == selector) {
      out.push(selector.to_string());
    }
  }
  out
}

/// Relaxes child combinators to descendant ones, except inside `[attr]` or quotes.
fn loosen_combinators(selector: &str) -> String {
  let chars: Vec<char> = selector.chars().collect();
  let mut out = String::new();
  let mut depth = 0usize;
  let mut quote: Option<char> = None;
  let mut i = 0;
  while i < chars.len() {
    let ch = chars[i];
    if let Some(q) = quote {
      out.push(ch);
      if ch == q && (i == 0 || chars[i - 1] != '\\') {
        quote = None;
      }
    } else if ch == '"' || ch == '\'' {
      quote = Some(ch);
      out.push(ch);
    } else if ch == '[' {
      depth += 1;
      out.push(ch);
    } else if ch == ']' {
      depth = depth.saturating_sub(1);
      out.push(ch);
    } else if ch == '>' && depth == 0 {
      out.truncate(out.trim_end_matches(js::is_space).len());
      out.push(' ');
      while i + 1 < chars.len() && js::is_space(chars[i + 1]) {
        i += 1;
      }
    } else {
      out.push(ch);
    }
    i += 1;
  }
  js::trim(&out).to_string()
}

/// TS `tooStrictSelectors`.
pub fn too_strict_selectors(code: &str, html: &str) -> Vec<TooStrictSelector> {
  let selectors: Vec<String> = extract_selector_literals(code)
    .into_iter()
    .filter(|x| x.contains('>'))
    .collect();
  if selectors.is_empty() {
    return Vec::new();
  }

  let doc = dom::parse_document(html);
  let count = |selector: &str| dom::query_selector_all(&doc, selector).map(|x| x.len());
  let mut out = Vec::new();
  for selector in selectors {
    if count(&selector) != Some(0) {
      continue;
    }
    let loosened = loosen_combinators(&selector);
    if let Some(n) = count(&loosened)
      && n > 0
    {
      out.push(TooStrictSelector {
        selector,
        loosened,
        count: n,
      });
    }
  }
  out
}

/// TS `tooStrictFeedback`.
pub fn too_strict_feedback(broken: &[TooStrictSelector]) -> String {
  let lines: Vec<String> = broken
    .iter()
    .map(|b| {
      format!(
        "- `{}` matched 0; `{}` matches {}",
        b.selector, b.loosened, b.count
      )
    })
    .collect();
  format!(
    "Some selectors matched 0 elements even though the target IS on the page - a child combinator (`>`) is breaking on a wrapper element you couldn't see in the sample. Switch these to descendant combinators:\n{}\nRewrite these (and re-check your other selectors for the same issue). Leave genuinely-absent fields empty - never broaden a selector just to match something.",
    lines.join("\n")
  )
}
