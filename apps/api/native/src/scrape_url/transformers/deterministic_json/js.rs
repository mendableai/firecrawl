//! JavaScript string semantics the TS port relies on: `\s`, `trim()`, and
//! lengths and slices in UTF-16 units.

use super::super::tokens::utf16_prefix;

/// JS `\s` as a regex character class.
pub const SPACE_CLASS: &str = r"[\t\n\x0B\x0C\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]";

/// Whether `c` matches JS `\s`.
pub fn is_space(c: char) -> bool {
  matches!(
    c,
    '\t' | '\n' | '\u{0B}' | '\u{0C}' | '\r' | ' ' | '\u{A0}' | '\u{1680}' | '\u{2000}'
      ..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}'
  )
}

/// JS `String.prototype.trim`.
pub fn trim(s: &str) -> &str {
  s.trim_matches(is_space)
}

/// JS `s.replace(/\s+/g, " ").trim()`.
pub fn collapse_space(s: &str) -> String {
  let mut out = String::with_capacity(s.len());
  let mut pending_space = false;
  for c in s.chars() {
    if is_space(c) {
      pending_space = true;
      continue;
    }
    if pending_space && !out.is_empty() {
      out.push(' ');
    }
    pending_space = false;
    out.push(c);
  }
  out
}

/// JS `s.length`.
pub fn len(s: &str) -> usize {
  s.encode_utf16().count()
}

/// JS `s.slice(0, n)`.
pub fn prefix(s: &str, n: usize) -> &str {
  utf16_prefix(s, n)
}

/// JS `s.slice(-n)`, which is the whole string when `n` is 0.
pub fn suffix(s: &str, n: usize) -> &str {
  if n == 0 {
    return s;
  }
  let mut units = 0;
  for (index, c) in s.char_indices().rev() {
    units += c.len_utf16();
    if units > n {
      return &s[index + c.len_utf8()..];
    }
  }
  s
}

/// JS `JSON.stringify` of a string.
pub fn quote(s: &str) -> String {
  serde_json::Value::from(s).to_string()
}
