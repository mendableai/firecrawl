//! culori's `lab/` and `lab65/`: `parseLab`, `convertLabToXyz50`,
//! `convertXyz65ToLab65` and `convertRgbToLab65`.

use super::super::js;
use super::parse::{Coord, Modern, color, is_hue, scaled, value};
use super::xyz::{D50, D65, rgb_to_xyz65};
use super::{Color, Mode, Rgb};

/// culori's `parseLab`.
pub fn parse_lab((name, [l, a, b, alpha]): &Modern) -> Option<Color> {
  if name != "lab" || is_hue(*l) || is_hue(*a) || is_hue(*b) {
    return None;
  }
  let ab = |c: Coord| scaled(c, |x| (x * 125.0) / 100.0);
  color(
    Mode::Lab,
    [
      value(*l).map(|l| js::min(js::max(0.0, l), 100.0)),
      ab(*a),
      ab(*b),
    ],
    *alpha,
  )
}

/// culori's `convertLabToXyz50`.
pub fn lab_to_xyz50([l, a, b]: [f64; 3]) -> [f64; 3] {
  let k = 29f64.powf(3.0) / 3f64.powf(3.0);
  let e = 6f64.powf(3.0) / 29f64.powf(3.0);
  let f = |v: f64| {
    if v.powf(3.0) > e {
      v.powf(3.0)
    } else {
      (116.0 * v - 16.0) / k
    }
  };
  let fy = (l + 16.0) / 116.0;
  let fx = a / 500.0 + fy;
  let fz = fy - b / 200.0;
  [f(fx) * D50[0], f(fy) * D50[1], f(fz) * D50[2]]
}

/// culori's `convertXyz65ToLab65`.
pub fn xyz65_to_lab65([x, y, z]: [f64; 3]) -> [f64; 3] {
  let k = 29f64.powf(3.0) / 3f64.powf(3.0);
  let e = 6f64.powf(3.0) / 29f64.powf(3.0);
  let f = |v: f64| {
    if v > e {
      v.cbrt()
    } else {
      (k * v + 16.0) / 116.0
    }
  };
  let [f0, f1, f2] = [f(x / D65[0]), f(y / D65[1]), f(z / D65[2])];
  [116.0 * f1 - 16.0, 500.0 * (f0 - f1), 200.0 * (f1 - f2)]
}

/// culori's `convertRgbToLab65`, which zeroes the chroma float error leaves on grays.
pub fn rgb_to_lab65(rgb: &Rgb) -> [f64; 3] {
  let [l, a, b] = xyz65_to_lab65(rgb_to_xyz65(rgb));
  if rgb.r == rgb.b && rgb.b == rgb.g {
    return [l, 0.0, 0.0];
  }
  [l, a, b]
}
