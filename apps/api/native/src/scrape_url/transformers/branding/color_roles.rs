//! TS `color-roles.ts`: telling brand color from page chrome.

use super::js;

/// `parseInt(h.slice(i, i + 2), 16)`: the leading hex digits of the pair, NaN without any.
fn channel(h: &str, i: usize) -> f64 {
  let digits: String = h
    .chars()
    .skip(i)
    .take(2)
    .take_while(char::is_ascii_hexdigit)
    .collect();
  u32::from_str_radix(&digits, 16).map_or(f64::NAN, f64::from)
}

/// `hex.replace("#", "")` and its channels, when it has six UTF-16 units or more.
fn channels(hex: &str) -> Option<[f64; 3]> {
  let h = hex.replacen('#', "", 1);
  (js::len(&h) >= 6).then(|| [channel(&h, 0), channel(&h, 2), channel(&h, 4)])
}

fn spread([r, g, b]: [f64; 3]) -> f64 {
  js::max(r, js::max(g, b)) - js::min(r, js::min(g, b))
}

/// CIE-ish luma used to tell chrome (near-black / near-white) from brand color.
pub fn contrast_yiq(hex: &str) -> f64 {
  match channels(hex) {
    Some([r, g, b]) => (r * 299.0 + g * 587.0 + b * 114.0) / 1000.0,
    None => 0.0,
  }
}

pub fn is_grayish(hex: &str) -> bool {
  channels(hex).is_none_or(|c| spread(c) < 15.0)
}

pub fn is_near_black(hex: &str) -> bool {
  match channels(hex) {
    Some([r, g, b]) => contrast_yiq(hex) < 40.0 && js::max(r, js::max(g, b)) < 140.0,
    None => contrast_yiq(hex) < 40.0,
  }
}

/// Near-black with no hue: a monochrome brand's black, not navy chrome.
pub fn is_neutral_dark(hex: &str) -> bool {
  channels(hex).is_some_and(|c| is_near_black(hex) && spread(c) < 30.0)
}

/// Straight-line RGB distance; infinite unless both are `#RRGGBB`.
pub fn color_distance(a: Option<&str>, b: Option<&str>) -> f64 {
  let (Some(x), Some(y)) = (normalize_role_hex(a), normalize_role_hex(b)) else {
    return f64::INFINITY;
  };
  let (Some(p), Some(q)) = (channels(&x), channels(&y)) else {
    return f64::INFINITY;
  };
  js::hypot(&[p[0] - q[0], p[1] - q[1], p[2] - q[2]])
}

/// Nearly white, whatever its tint: on a light page that is a section background.
pub fn is_pale(hex: &str) -> bool {
  channels(hex).is_some_and(|[r, g, b]| {
    (js::max(r, js::max(g, b)) + js::min(r, js::min(g, b))) / 2.0 / 255.0 > 0.9
  })
}

/// Chromatic brand color: not gray chrome, and not near-black or near-white chrome on light pages.
pub fn is_usable_brand_primary(hex: &str, color_scheme: Option<&str>) -> bool {
  if is_grayish(hex) {
    return false;
  }
  !(color_scheme != Some("dark") && (is_near_black(hex) || is_pale(hex)))
}

/// What browsers draw unstyled links in (unvisited, visited); never a brand's choice.
pub fn is_browser_link_color(value: Option<&str>) -> bool {
  normalize_role_hex(value).is_some_and(|hex| hex == "#0000EE" || hex == "#551A8B")
}

/// `#RGB` or `#RRGGBB`, upper-cased and expanded; names like "navy" are rejected.
pub fn normalize_role_hex(value: Option<&str>) -> Option<String> {
  let raw = js::trim(value.filter(|x| !x.is_empty())?);
  let h = raw.strip_prefix('#')?;
  if !matches!(h.len(), 3 | 6) || !h.bytes().all(|b| b.is_ascii_hexdigit()) {
    return None;
  }
  let full = if h.len() == 3 {
    h.chars().flat_map(|c| [c, c]).collect()
  } else {
    h.to_string()
  };
  Some(format!("#{full}").to_uppercase())
}

/// Brand primary is a chromatic color, not page chrome; on light pages near-black is skipped.
pub fn pick_brand_primary(
  ranked: &[String],
  background: Option<&str>,
  text_primary: Option<&str>,
  color_scheme: Option<&str>,
) -> String {
  let skip = |h: &str| Some(h) == background || Some(h) == text_primary;
  let light_page = color_scheme != Some("dark");

  let chromatic = ranked.iter().find(|h| {
    if skip(h) || is_grayish(h) {
      return false;
    }
    !(light_page && (is_near_black(h) || is_pale(h)))
  });
  if let Some(chromatic) = chromatic {
    return chromatic.clone();
  }
  ranked
    .iter()
    .find(|h| !is_grayish(h) && !skip(h))
    .cloned()
    .unwrap_or_else(|| if light_page { "#000000" } else { "#FFFFFF" }.to_string())
}

/// Inclusive 0.5 bar, since models often answer exactly 0.5; header chrome is rescued down to 0.4.
const LLM_COLOR_CONFIDENCE: f64 = 0.5;

pub fn should_apply_llm_color_roles(
  confidence: f64,
  llm_primary: Option<&str>,
  heuristic_primary: Option<&str>,
  color_scheme: Option<&str>,
) -> bool {
  if confidence >= LLM_COLOR_CONFIDENCE {
    return true;
  }
  if confidence < 0.4 {
    return false;
  }
  let Some(llm) = normalize_role_hex(llm_primary) else {
    return false;
  };
  if is_grayish(&llm) || is_near_black(&llm) {
    return false;
  }
  color_scheme != Some("dark")
    && heuristic_primary.is_some_and(|h| !h.is_empty() && is_near_black(h))
}
