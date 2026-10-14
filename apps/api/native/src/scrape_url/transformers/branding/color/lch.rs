//! culori's `lch/`: `parseLch` and `convertLchToLab`, which oklch shares.

use std::f64::consts::PI;

use super::super::js;
use super::parse::{Modern, color, is_hue, is_percentage, scaled, value};
use super::{Color, Mode};

/// culori's `parseLch`.
pub fn parse_lch((name, [l, c, h, a]): &Modern) -> Option<Color> {
  if name != "lch" || is_hue(*l) || is_percentage(*h) {
    return None;
  }
  let l = value(*l).map(|l| js::min(js::max(0.0, l), 100.0));
  let c = scaled(*c, |x| (x * 150.0) / 100.0).map(|c| js::max(0.0, c));
  color(Mode::Lch, [l, c, value(*h)], *a)
}

/// culori's `convertLchToLab`; a missing or zero chroma gives a neutral color.
pub fn lch_to_lab(l: f64, c: Option<f64>, h: Option<f64>) -> [f64; 3] {
  let h = h.unwrap_or(0.0);
  match c {
    Some(c) if c != 0.0 && !c.is_nan() => [
      l,
      c * ((h / 180.0) * PI).cos(),
      c * ((h / 180.0) * PI).sin(),
    ],
    _ => [l, 0.0, 0.0],
  }
}
