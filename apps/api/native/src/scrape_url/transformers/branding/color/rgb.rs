//! culori's `rgb/` parsers: `rgb()` in both syntaxes, hex, names and `transparent`.

use std::sync::LazyLock;

use regex::Regex;

use super::named::NAMED_COLORS;
use super::parse::{Coord, Modern, color, is_hue, value};
use super::regex::{alpha, number, regex};
use super::{Color, Mode};

static RGB_NUM: LazyLock<Option<Regex>> =
  LazyLock::new(|| regex(r"^rgba?\({s}*{num}{c}{num}{c}{num}{s}*{alpha}\)$"));
static RGB_PERCENT: LazyLock<Option<Regex>> =
  LazyLock::new(|| regex(r"^rgba?\({s}*{num}%{c}{num}%{c}{num}%{s}*{alpha}\)$"));

fn rgb(channels: [f64; 3], alpha: Option<f64>) -> Color {
  Color {
    mode: Mode::Rgb,
    channels: channels.map(Some),
    alpha,
  }
}

/// culori's `parseRgb`.
pub fn parse_rgb((name, [r, g, b, a]): &Modern) -> Option<Color> {
  if !matches!(name.as_str(), "rgb" | "rgba") || is_hue(*r) || is_hue(*g) || is_hue(*b) {
    return None;
  }
  let channel = |c: Coord| match c {
    Coord::Number(x) => Some(x / 255.0),
    _ => value(c).map(|x| x / 100.0),
  };
  color(Mode::Rgb, [channel(*r), channel(*g), channel(*b)], *a)
}

/// culori's `parseNumber`: a `0xRRGGBB`-style value with `len` hex digits.
fn from_hex_number(color: u32, len: usize) -> Option<Color> {
  let byte = |shift: u32| f64::from((color >> shift) & 0xff) / 255.0;
  let nibble = |shift: u32| {
    let n = (color >> shift) & 0xf;
    f64::from(n | (n << 4)) / 255.0
  };
  match len {
    3 => Some(rgb([nibble(8), nibble(4), nibble(0)], None)),
    4 => Some(rgb([nibble(12), nibble(8), nibble(4)], Some(nibble(0)))),
    6 => Some(rgb([byte(16), byte(8), byte(0)], None)),
    8 => Some(rgb([byte(24), byte(16), byte(8)], Some(byte(0)))),
    _ => None,
  }
}

/// culori's `parseHex`; the `#` is optional.
pub fn parse_hex(s: &str) -> Option<Color> {
  let digits = s.strip_prefix('#').unwrap_or(s);
  if !matches!(digits.len(), 3 | 4 | 6 | 8) || !digits.bytes().all(|b| b.is_ascii_hexdigit()) {
    return None;
  }
  from_hex_number(u32::from_str_radix(digits, 16).ok()?, digits.len())
}

/// culori's `parseRgbLegacy`.
pub fn parse_rgb_legacy(s: &str) -> Option<Color> {
  if let Some(c) = RGB_NUM.as_ref().and_then(|re| re.captures(s)) {
    let channel = |i| number(&c, i).map_or(f64::NAN, |x| x / 255.0);
    return Some(rgb([channel(1), channel(2), channel(3)], alpha(&c, 4)));
  }
  let c = RGB_PERCENT.as_ref()?.captures(s)?;
  let channel = |i| number(&c, i).map_or(f64::NAN, |x| x / 100.0);
  Some(rgb([channel(1), channel(2), channel(3)], alpha(&c, 4)))
}

/// culori's `parseNamed`.
pub fn parse_named(s: &str) -> Option<Color> {
  let name = s.to_lowercase();
  let i = NAMED_COLORS
    .binary_search_by(|(x, _)| (*x).cmp(name.as_str()))
    .ok()?;
  from_hex_number(NAMED_COLORS[i].1, 6)
}

/// culori's `parseTransparent`.
pub fn parse_transparent(s: &str) -> Option<Color> {
  (s == "transparent").then(|| rgb([0.0; 3], Some(0.0)))
}
