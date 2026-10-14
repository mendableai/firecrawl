//! culori's `hsl/`: `hsl()` in both syntaxes and `convertHslToRgb`.

use std::sync::LazyLock;

use regex::Regex;

use super::parse::{Coord, Modern, color, is_hue, is_percentage, value};
use super::regex::{alpha, number, regex};
use super::{Color, Mode};

static HSL: LazyLock<Option<Regex>> = LazyLock::new(|| {
  regex(r"^hsla?\({s}*(?:{num}(deg|grad|rad|turn)|{num}){c}{num}%{c}{num}%{s}*{alpha}\)$")
});

/// culori's `parseHsl`.
pub fn parse_hsl((name, [h, s, l, a]): &Modern) -> Option<Color> {
  if !matches!(name.as_str(), "hsl" | "hsla") || is_percentage(*h) || is_hue(*s) || is_hue(*l) {
    return None;
  }
  let fraction = |c: Coord| value(c).map(|x| x / 100.0);
  color(Mode::Hsl, [value(*h), fraction(*s), fraction(*l)], *a)
}

/// culori's `parseHslLegacy`.
pub fn parse_hsl_legacy(s: &str) -> Option<Color> {
  let c = HSL.as_ref()?.captures(s)?;
  let hue = number(&c, 3).or_else(|| {
    let value = number(&c, 1)?;
    match c.get(2)?.as_str() {
      "deg" => Some(value),
      "rad" => Some((value / std::f64::consts::PI) * 180.0),
      "grad" => Some((value / 10.0) * 9.0),
      "turn" => Some(value * 360.0),
      _ => None,
    }
  });
  let fraction = |i| number(&c, i).map(|x| (x / 100.0).clamp(0.0, 1.0));
  Some(Color {
    mode: Mode::Hsl,
    channels: [hue, fraction(4), fraction(5)],
    alpha: alpha(&c, 6),
  })
}

/// culori's `normalizeHue`.
pub fn normalize_hue(hue: f64) -> f64 {
  let hue = hue % 360.0;
  if hue < 0.0 { hue + 360.0 } else { hue }
}

/// culori's hue sector formula, shared by `convertHslToRgb` and `convertHsvToRgb`.
pub fn by_sector(h: f64, [max, mid, min]: [f64; 3]) -> [f64; 3] {
  let sector = (h / 60.0).floor();
  if !(0.0..6.0).contains(&sector) {
    return [min, min, min];
  }
  match sector as i64 {
    0 => [max, mid, min],
    1 => [mid, max, min],
    2 => [min, max, mid],
    3 => [min, mid, max],
    4 => [mid, min, max],
    5 => [max, min, mid],
    _ => [min, min, min],
  }
}

/// culori's `convertHslToRgb`.
pub fn hsl_to_rgb([h, s, l]: [Option<f64>; 3]) -> [f64; 3] {
  let h = normalize_hue(h.unwrap_or(0.0));
  let (s, l) = (s.unwrap_or(0.0), l.unwrap_or(0.0));
  let m1 = l + s * (if l < 0.5 { l } else { 1.0 - l });
  let m2 = m1 - (m1 - l) * 2.0 * (((h / 60.0) % 2.0) - 1.0).abs();
  by_sector(h, [m1, m2, 2.0 * l - m1])
}
