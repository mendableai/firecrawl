//! culori's `util/regex.js` pieces for the comma-separated legacy syntaxes.

use regex::{Captures, Regex};

/// JS `\s`, which differs from the regex crate's (U+FEFF in, U+0085 out).
const S: &str = r"[\t\n\x0B\x0C\r \u{A0}\u{1680}\u{2000}-\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}\u{FEFF}]";
const NUM: &str = r"([+-]?[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?)";

/// `pattern` with culori's `${c}` (comma) and `${num_per}` (alpha) pieces filled in.
pub fn regex(pattern: &str) -> Option<Regex> {
  let pattern = pattern
    .replace("{c}", &format!("{S}*,{S}*"))
    .replace("{alpha}", &format!("(?:,{S}*(?:{NUM}%|{NUM}){S}*)?"))
    .replace("{num}", NUM)
    .replace("{s}", S);
  Regex::new(&pattern).ok()
}

pub fn number(captures: &Captures, i: usize) -> Option<f64> {
  captures.get(i).and_then(|x| x.as_str().parse().ok())
}

/// The alpha in groups `percent` / `percent + 1`, as culori clamps it.
pub fn alpha(captures: &Captures, percent: usize) -> Option<f64> {
  number(captures, percent)
    .map(|x| x / 100.0)
    .or_else(|| number(captures, percent + 1))
    .map(|x| x.clamp(0.0, 1.0))
}
