//! culori's `lab/`: `parseLab` and `convertLabToXyz50`.

use super::super::js;
use super::parse::{Coord, Modern, color, is_hue, scaled, value};
use super::xyz::D50;
use super::{Color, Mode};

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
