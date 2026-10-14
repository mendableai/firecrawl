//! culori's `lrgb/`: the sRGB transfer function in both directions.

use super::super::js;

/// `Math.sign(c) || 1`.
pub fn sign_or_one(c: f64) -> f64 {
  let sign = js::sign(c);
  if sign == 0.0 || sign.is_nan() {
    1.0
  } else {
    sign
  }
}

fn to_srgb_gamma(c: f64) -> f64 {
  let abs = c.abs();
  if abs > 0.0031308 {
    return sign_or_one(c) * (1.055 * abs.powf(1.0 / 2.4) - 0.055);
  }
  c * 12.92
}

/// One channel of culori's `convertRgbToLrgb`.
pub fn to_srgb_linear(c: f64) -> f64 {
  let abs = c.abs();
  if abs <= 0.04045 {
    return c / 12.92;
  }
  sign_or_one(c) * ((abs + 0.055) / 1.055).powf(2.4)
}

/// culori's `convertLrgbToRgb`.
pub fn lrgb_to_rgb([r, g, b]: [f64; 3]) -> [f64; 3] {
  [to_srgb_gamma(r), to_srgb_gamma(g), to_srgb_gamma(b)]
}
