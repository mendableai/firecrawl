//! Font candidates for Jev. Name cleanup is deterministic; Jev only judges
//! which are brand fonts and what role they play.

use std::sync::LazyLock;

use regex::Regex;

use super::super::js;
use super::super::llm::LlmInput;

const MAX_FONTS: usize = 8;

const GENERIC_FONTS: [&str; 16] = [
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "ui-rounded",
  "-apple-system",
  "blinkmacsystemfont",
  "inherit",
  "initial",
  "emoji",
  "math",
];

/// Fonts pages list as fallbacks in their stacks. They are only reported when
/// the page's typography uses them, or when nothing else is left.
pub const FALLBACK_FONTS: [&str; 24] = [
  "arial",
  "helvetica",
  "helvetica neue",
  "segoe ui",
  "roboto",
  "oxygen",
  "ubuntu",
  "cantarell",
  "noto sans",
  "droid sans",
  "lucida",
  "lucida grande",
  "lucida sans unicode",
  "tahoma",
  "verdana",
  "times",
  "times new roman",
  "georgia",
  "courier",
  "courier new",
  "apple color emoji",
  "segoe ui emoji",
  "segoe ui symbol",
  "noto color emoji",
];

static MONOSPACE: LazyLock<Option<Regex>> =
  LazyLock::new(|| Regex::new(r"(?i-u)\b(?:mono|code)\b|consolas|menlo").ok());

/// `s` without an ASCII-case-insensitive `suffix`.
fn strip_suffix_ignore_case<'a>(s: &'a str, suffix: &str) -> Option<&'a str> {
  let cut = s.len().checked_sub(suffix.len())?;
  s.get(cut..)?
    .eq_ignore_ascii_case(suffix)
    .then(|| &s[..cut])
}

/// `s.replace(/\s+/g, " ")`.
fn collapse_spaces(s: &str) -> String {
  let mut out = String::with_capacity(s.len());
  for c in s.chars() {
    if !js::is_space(c) {
      out.push(c);
    } else if !out.ends_with(' ') {
      out.push(' ');
    }
  }
  out
}

/// `s.replace(/\b\w/g, ch => ch.toUpperCase())`, with JS's ASCII `\w`.
fn capitalize_words(s: &str) -> String {
  let mut after_word = false;
  s.chars()
    .map(|c| {
      let word = c.is_ascii_alphanumeric() || c == '_';
      let c = if word && !after_word {
        c.to_ascii_uppercase()
      } else {
        c
      };
      after_word = word;
      c
    })
    .collect()
}

/// TS `cleanFontFamily`: the first family of a stack, without quotes,
/// next/font obfuscation or a variable-font suffix. `None` for generic
/// families, CSS variables and fallback faces.
pub fn clean_font_family(raw: &str) -> Option<String> {
  let name = js::trim(raw.split(',').next().unwrap_or_default());
  let name = name.strip_prefix(['"', '\'']).unwrap_or(name);
  let name = name.strip_suffix(['"', '\'']).unwrap_or(name);
  if name.is_empty()
    || name
      .get(..4)
      .is_some_and(|x| x.eq_ignore_ascii_case("var("))
  {
    return None;
  }
  if name.to_ascii_lowercase().contains("fallback") {
    return None;
  }
  // next/font obfuscation: "__Roboto_Mono_c8ca7d" is "Roboto Mono".
  let name = name.trim_start_matches('_');
  let hashed = name.len().checked_sub(7).and_then(|cut| {
    let tail = name.get(cut..)?.strip_prefix('_')?;
    tail
      .bytes()
      .all(|b| b.is_ascii_hexdigit())
      .then(|| &name[..cut])
  });
  let name = collapse_spaces(&hashed.unwrap_or(name).replace('_', " "));
  let name = js::trim(&name);
  // Variable-font builds name the same family: "Newsreader Variable".
  let name = strip_suffix_ignore_case(name, " variable")
    .or_else(|| strip_suffix_ignore_case(name, " vf"))
    .unwrap_or(name);
  if name.is_empty() || GENERIC_FONTS.contains(&name.to_lowercase().as_str()) {
    return None;
  }
  if name == name.to_lowercase() {
    return Some(capitalize_words(name));
  }
  Some(name.to_string())
}

/// Matching key for a family: case and spacing don't make a different font.
fn family_key(family: &str) -> String {
  js::strip_spaces(&family.to_lowercase())
}

/// TS `typographyRole`: the role the page's own heading and body stacks give a family.
fn typography_role(family: &str, input: &LlmInput) -> Option<&'static str> {
  if MONOSPACE.as_ref().is_some_and(|x| x.is_match(family)) {
    return Some("monospace");
  }
  let t = input.js_branding.typography.as_ref();
  let key = |raw: Option<&String>| {
    let raw = raw.filter(|x| !x.is_empty())?;
    Some(family_key(&clean_font_family(raw)?))
  };
  let name = Some(family_key(family));
  let body = [
    key(t.map(|t| &t.font_families.primary)),
    key(t.and_then(|t| t.font_stacks.body.first())),
    key(t.and_then(|t| t.font_stacks.paragraph.first())),
  ];
  let heading = [
    key(t.map(|t| &t.font_families.heading)),
    key(t.and_then(|t| t.font_stacks.heading.first())),
  ];
  // A family used for both is reported as body, the page's primary font.
  if body.contains(&name) {
    return Some("body");
  }
  if heading.contains(&name) {
    return Some("heading");
  }
  None
}

pub struct FontCandidate {
  pub family: String,
  pub count: u64,
  pub role: Option<&'static str>,
}

/// TS `collectFonts`: the page's fonts by cleaned family, most used first.
pub fn collect_fonts(input: &LlmInput) -> Vec<FontCandidate> {
  let mut fonts: Vec<FontCandidate> = Vec::new();
  for font in input.js_branding.fonts.iter().flatten() {
    let Some(family) = Some(&font.family)
      .filter(|x| !x.is_empty())
      .and_then(|x| clean_font_family(x))
    else {
      continue;
    };
    let count = font.count.map_or(1, u64::from);
    // "CormorantGaramond" and "Cormorant Garamond" are one family; keep the
    // spaced name.
    let key = family_key(&family);
    match fonts.iter_mut().find(|x| family_key(&x.family) == key) {
      Some(existing) => {
        existing.count += count;
        if !existing.family.contains(' ') && family.contains(' ') {
          existing.family = family;
        }
      }
      None => fonts.push(FontCandidate {
        family,
        count,
        role: None,
      }),
    }
  }
  fonts.sort_by_key(|x| std::cmp::Reverse(x.count));
  fonts.truncate(MAX_FONTS);
  for font in &mut fonts {
    font.role = typography_role(&font.family, input);
  }
  fonts
}
