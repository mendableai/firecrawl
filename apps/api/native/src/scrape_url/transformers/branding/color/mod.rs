//! The part of culori 4.0.2 that branding uses, ported literally: `parse` and
//! conversion to sRGB for the CSS color syntaxes browsers produce, plus TS
//! `hexify`. One module per culori color space directory.

mod hsl;
mod hwb;
mod lab;
mod lch;
mod lrgb;
mod named;
mod oklab;
mod parse;
mod profiles;
mod regex;
mod rgb;
mod xyz;

use super::js;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
  Rgb,
  Hsl,
  Hwb,
  Lab,
  Lch,
  Oklab,
  Oklch,
  Lrgb,
  P3,
  A98,
  Prophoto,
  Rec2020,
  Xyz50,
  Xyz65,
}

/// A parsed color. Channels culori leaves undefined (`none`) are `None`.
#[derive(Debug, Clone, Copy)]
pub struct Color {
  pub mode: Mode,
  pub channels: [Option<f64>; 3],
  pub alpha: Option<f64>,
}

/// A color in sRGB, channels from 0 to 1 and not clamped.
#[derive(Debug, Clone, Copy)]
pub struct Rgb {
  pub r: Option<f64>,
  pub g: Option<f64>,
  pub b: Option<f64>,
  pub alpha: Option<f64>,
}

/// culori `parse`, trying each mode's parsers in culori's order. `None` also
/// covers a parse that throws.
pub fn parse(s: &str) -> Option<Color> {
  let tokens = parse::tokenize(s).ok()?;
  let modern = match &tokens {
    Some(tokens) => parse::parse_modern(tokens).ok()?,
    None => None,
  };
  let parsed = modern.as_ref().and_then(|m| {
    rgb::parse_rgb(m)
      .or_else(|| hsl::parse_hsl(m))
      .or_else(|| hwb::parse_hwb(m))
      .or_else(|| lab::parse_lab(m))
      .or_else(|| lch::parse_lch(m))
      .or_else(|| oklab::parse_oklab(m))
      .or_else(|| oklab::parse_oklch(m))
  });
  let parsed = parsed
    .or_else(|| hsl::parse_hsl_legacy(s))
    .or_else(|| rgb::parse_hex(s))
    .or_else(|| rgb::parse_rgb_legacy(s))
    .or_else(|| rgb::parse_named(s))
    .or_else(|| rgb::parse_transparent(s));
  if parsed.is_some() {
    return parsed;
  }
  parse::parse_color_syntax(&tokens?).ok()?
}

/// culori `rgb(color)`. Only a color parsed as sRGB can keep a missing channel.
pub fn to_rgb(color: &Color) -> Rgb {
  let [c1, c2, c3] = color.channels;
  let numbers = color.channels.map(|c| c.unwrap_or(0.0));
  let [r, g, b] = match color.mode {
    Mode::Rgb => {
      return Rgb {
        r: c1,
        g: c2,
        b: c3,
        alpha: color.alpha,
      };
    }
    Mode::Hsl => hsl::hsl_to_rgb(color.channels),
    Mode::Hwb => hwb::hwb_to_rgb(color.channels),
    Mode::Lab => xyz::xyz50_to_rgb(lab::lab_to_xyz50(numbers)),
    Mode::Lch => xyz::xyz50_to_rgb(lab::lab_to_xyz50(lch::lch_to_lab(numbers[0], c2, c3))),
    Mode::Oklab => lrgb::lrgb_to_rgb(oklab::oklab_to_lrgb(numbers)),
    Mode::Oklch => lrgb::lrgb_to_rgb(oklab::oklab_to_lrgb(lch::lch_to_lab(numbers[0], c2, c3))),
    Mode::Lrgb => lrgb::lrgb_to_rgb(numbers),
    Mode::P3 => xyz::xyz65_to_rgb(profiles::p3_to_xyz65(numbers)),
    Mode::A98 => xyz::xyz65_to_rgb(profiles::a98_to_xyz65(numbers)),
    Mode::Rec2020 => xyz::xyz65_to_rgb(profiles::rec2020_to_xyz65(numbers)),
    Mode::Prophoto => xyz::xyz50_to_rgb(profiles::prophoto_to_xyz50(numbers)),
    Mode::Xyz50 => xyz::xyz50_to_rgb(numbers),
    Mode::Xyz65 => xyz::xyz65_to_rgb(numbers),
  };
  Rgb {
    r: Some(r),
    g: Some(g),
    b: Some(b),
    alpha: color.alpha,
  }
}

/// `Math.round(channel * 255)`, and the `#RRGGBB` digits JS prints for it.
fn to_byte(channel: f64) -> f64 {
  js::round(channel * 255.0)
}

fn hex_digits(byte: f64) -> String {
  if byte.is_nan() {
    return "NaN".to_string();
  }
  format!("{:02x}", byte as u8)
}

/// TS `hexify`: `#RRGGBB` for a CSS color, blended over `background` (white
/// when absent or unreadable) if translucent. `None` when it doesn't parse or
/// is fully transparent.
pub fn hexify(rgba: Option<&str>, background: Option<&str>) -> Option<String> {
  let color = to_rgb(&parse(rgba.filter(|x| !x.is_empty())?)?);
  let mut channels = [color.r, color.g, color.b].map(|c| to_byte(c.unwrap_or(0.0)));
  let alpha = color.alpha.unwrap_or(1.0);
  if alpha < 0.01 {
    return None;
  }

  if alpha < 1.0 {
    let mut bg = [255.0; 3];
    if let Some(bg_color) = background.and_then(parse).map(|x| to_rgb(&x))
      && bg_color.alpha.unwrap_or(1.0) >= 0.01
    {
      bg = [bg_color.r, bg_color.g, bg_color.b].map(|c| to_byte(c.unwrap_or(1.0)));
    }
    for (channel, bg) in channels.iter_mut().zip(bg) {
      *channel = js::round(alpha * *channel + (1.0 - alpha) * bg);
    }
  }

  let hex: String = channels
    .map(|c| hex_digits(js::max(0.0, js::min(255.0, c))))
    .concat();
  Some(format!("#{hex}").to_uppercase())
}
