//! Color candidates for Jev. Jev reads hex values poorly, so each is described
//! by name and usage; the hex stays in code.

use super::super::color;
use super::super::js;
use super::super::llm::LlmInput;
use super::clip;

const MAX_COLORS: usize = 24;

const HUES: [(f64, &str); 15] = [
  (15.0, "red"),
  (40.0, "orange"),
  (52.0, "amber"),
  (68.0, "yellow"),
  (90.0, "yellow-green"),
  (150.0, "green"),
  (180.0, "teal"),
  (200.0, "cyan"),
  (240.0, "blue"),
  (255.0, "indigo"),
  (268.0, "violet"),
  (290.0, "purple"),
  (330.0, "magenta"),
  (345.0, "pink"),
  (360.0, "red"),
];

/// TS `describeColor`.
pub fn describe_color(hex: &str) -> String {
  let Some([h, s, l]) = color::parse(hex).map(|c| color::to_hsl(&c)) else {
    return "unknown color".to_string();
  };
  let (s, l) = (s.unwrap_or(0.0), l.unwrap_or(0.0));
  if s < 0.12 || !(0.06..=0.97).contains(&l) {
    // Pages often pair pure white with an off-white; keep them apart.
    let gray = match l {
      l if l > 0.995 => "white",
      l if l > 0.93 => "near-white",
      l if l > 0.7 => "light gray",
      l if l > 0.4 => "gray",
      l if l > 0.15 => "dark gray",
      l if l > 0.06 => "near-black",
      _ => "black",
    };
    return gray.to_string();
  }
  let h = h.unwrap_or(0.0);
  let hue = HUES
    .iter()
    .find(|(limit, _)| h < *limit)
    .map_or("red", |(_, name)| name);
  let lightness = match l {
    l if l < 0.25 => "very dark ",
    l if l < 0.4 => "dark ",
    l if l > 0.85 => "very light ",
    l if l > 0.7 => "light ",
    _ => "",
  };
  // Saturation reads as a distinct quality only away from the extremes.
  let saturation = if !(0.25..=0.85).contains(&l) {
    ""
  } else if s < 0.35 {
    "muted "
  } else if s > 0.65 {
    "vivid "
  } else {
    ""
  };
  format!("{lightness}{saturation}{hue}")
}

/// TS `normalizeHex`: `#RRGGBB`, or `None` for an unreadable or mostly
/// transparent color.
pub fn normalize_hex(value: Option<&str>) -> Option<String> {
  let parsed = color::parse(js::trim(value.filter(|x| !x.is_empty())?))?;
  if parsed.alpha.is_some_and(|a| a < 0.5) {
    return None;
  }
  Some(color::format_hex(&parsed).to_uppercase())
}

/// TS `colorName`.
pub fn color_name(value: Option<&str>, missing: &str) -> String {
  normalize_hex(value).map_or_else(|| missing.to_string(), |hex| describe_color(&hex))
}

pub struct ColorCandidate {
  pub hex: String,
  pub usage: Vec<String>,
}

/// TS `collectColors`: the heuristic palette, the likeliest logo's colors,
/// background candidates and button colors, one entry per hex.
pub fn collect_colors(input: &LlmInput) -> Vec<ColorCandidate> {
  let mut colors: Vec<ColorCandidate> = Vec::new();
  let mut add = |value: Option<&str>, usage: String| {
    let Some(hex) = normalize_hex(value) else {
      return;
    };
    match colors.iter_mut().find(|x| x.hex == hex) {
      Some(entry) if entry.usage.contains(&usage) => {}
      Some(entry) => entry.usage.push(usage),
      None => colors.push(ColorCandidate {
        hex,
        usage: vec![usage],
      }),
    }
  };

  if let Some(c) = &input.js_branding.colors {
    let roles = [
      ("primary", Some(&c.primary)),
      ("secondary", c.secondary.as_ref()),
      ("accent", Some(&c.accent)),
      ("background", Some(&c.background)),
      ("textPrimary", Some(&c.text_primary)),
      ("link", Some(&c.link)),
    ];
    for (role, value) in roles {
      add(
        value.map(String::as_str),
        format!("heuristic guess for {role}"),
      );
    }
  }
  let logos = &input.logo_candidates;
  let logo = input
    .heuristic_pick
    .as_ref()
    .and_then(|h| logos.get(h.index))
    .or(logos.first());
  for c in logo.and_then(|x| x.colors.as_deref()).unwrap_or_default() {
    let share = js::number_to_string(js::round(c.share * 100.0));
    add(
      Some(&c.color),
      format!("color of the logo ({share}% of it)"),
    );
  }
  for candidate in input.background_candidates {
    let source = candidate["source"].as_str().unwrap_or_default();
    add(
      candidate["color"].as_str(),
      format!("page background candidate ({source})"),
    );
  }
  for button in input.buttons.iter().take(super::MAX_BUTTONS) {
    let label = Some(clip(Some(&button.text), 40))
      .filter(|x| !x.is_empty())
      .unwrap_or_else(|| "unlabeled".to_string());
    add(
      Some(&button.background),
      format!("background of button \"{label}\""),
    );
    add(
      Some(&button.text_color),
      format!("text on button \"{label}\""),
    );
    add(
      button.border_color.as_deref(),
      format!("border of button \"{label}\""),
    );
  }
  colors.truncate(MAX_COLORS);
  colors
}
