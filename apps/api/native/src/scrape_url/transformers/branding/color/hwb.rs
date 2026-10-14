//! culori's `hwb/`: `parseHwb` and `convertHwbToRgb`, which goes through HSV.

use super::hsl::{by_sector, normalize_hue};
use super::parse::{Coord, Modern, color, is_hue, is_percentage, value};
use super::{Color, Mode};

/// culori's `parseHwb`.
pub fn parse_hwb((name, [h, w, b, a]): &Modern) -> Option<Color> {
  if name != "hwb" || is_percentage(*h) || is_hue(*w) || is_hue(*b) {
    return None;
  }
  let fraction = |c: Coord| value(c).map(|x| x / 100.0);
  color(Mode::Hwb, [value(*h), fraction(*w), fraction(*b)], *a)
}

/// culori's `convertHwbToRgb`.
pub fn hwb_to_rgb([h, w, b]: [Option<f64>; 3]) -> [f64; 3] {
  let (mut w, mut b) = (w.unwrap_or(0.0), b.unwrap_or(0.0));
  if w + b > 1.0 {
    let s = w + b;
    w /= s;
    b /= s;
  }
  let s = if b == 1.0 { 1.0 } else { 1.0 - w / (1.0 - b) };
  let v = 1.0 - b;
  let h = normalize_hue(h.unwrap_or(0.0));
  let f = (((h / 60.0) % 2.0) - 1.0).abs();
  by_sector(h, [v, v * (1.0 - s * f), v * (1.0 - s)])
}
