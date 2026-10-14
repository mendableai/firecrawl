//! culori's `oklab/` and `oklch/`: their parsers and `convertOklabToLrgb`.

use super::super::js;
use super::parse::{Coord, Modern, color, is_hue, is_percentage, scaled, value};
use super::{Color, Mode};

fn ok_lightness(coord: Coord) -> Option<f64> {
  scaled(coord, |x| x / 100.0).map(|l| js::min(js::max(0.0, l), 1.0))
}

/// culori's `parseOklab`.
pub fn parse_oklab((name, [l, a, b, alpha]): &Modern) -> Option<Color> {
  if name != "oklab" || is_hue(*l) || is_hue(*a) || is_hue(*b) {
    return None;
  }
  let ab = |c: Coord| scaled(c, |x| (x * 0.4) / 100.0);
  color(Mode::Oklab, [ok_lightness(*l), ab(*a), ab(*b)], *alpha)
}

/// culori's `parseOklch`.
pub fn parse_oklch((name, [l, c, h, a]): &Modern) -> Option<Color> {
  if name != "oklch" || is_hue(*l) || is_percentage(*h) {
    return None;
  }
  let c = scaled(*c, |x| (x * 0.4) / 100.0).map(|c| js::max(0.0, c));
  color(Mode::Oklch, [ok_lightness(*l), c, value(*h)], *a)
}

/// culori's `convertOklabToLrgb`.
pub fn oklab_to_lrgb([l, a, b]: [f64; 3]) -> [f64; 3] {
  let l_ = (l + 0.3963377773761749 * a + 0.2158037573099136 * b).powf(3.0);
  let m_ = (l - 0.1055613458156586 * a - 0.0638541728258133 * b).powf(3.0);
  let s_ = (l - 0.0894841775298119 * a - 1.2914855480194092 * b).powf(3.0);
  [
    4.076741636075957 * l_ - 3.3077115392580616 * m_ + 0.2309699031821044 * s_,
    -1.2684379732850317 * l_ + 2.6097573492876887 * m_ - 0.3413193760026573 * s_,
    -0.0041960761386756 * l_ - 0.7034186179359362 * m_ + 1.7076146940746117 * s_,
  ]
}
