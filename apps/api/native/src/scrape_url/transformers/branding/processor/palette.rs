//! TS `inferPalette`: page colors ranked by how much of the page they cover.

use super::super::color::hexify;
use super::super::color_roles::{
  contrast_yiq, is_browser_link_color, is_grayish, is_near_black, pick_brand_primary,
};
use super::super::js;
use super::super::profile::BrandingColors;
use super::super::types::Snapshot;

/// Weights in first-seen order, so ties rank like a stably sorted JS `Map`.
#[derive(Default)]
struct Votes(Vec<(String, f64)>);

impl Votes {
  fn add(&mut self, hex: Option<String>, weight: f64) {
    let Some(hex) = hex.filter(|x| !is_browser_link_color(Some(x))) else {
      return;
    };
    match self.0.iter_mut().find(|(h, _)| *h == hex) {
      Some((_, total)) => *total += weight,
      None => self.0.push((hex, weight)),
    }
  }

  fn ranked(mut self) -> Vec<String> {
    self
      .0
      .sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    self.0.into_iter().map(|(hex, _)| hex).collect()
  }
}

fn infer_background(
  ranked: &[String],
  color_scheme: Option<&str>,
  page_background: Option<&str>,
) -> String {
  let page_bg = page_background.filter(|x| !x.is_empty());
  let from_page = page_bg
    .and_then(|bg| hexify(Some(bg), None))
    .filter(|hex| is_grayish(hex))
    .unwrap_or_else(|| "#FFFFFF".to_string());
  if from_page != "#FFFFFF" && (page_bg.is_some() || ranked.is_empty()) {
    return from_page;
  }

  let find = |pred: &dyn Fn(f64) -> bool| {
    ranked
      .iter()
      .find(|h| is_grayish(h) && pred(contrast_yiq(h)))
      .map(String::as_str)
  };
  let inferred = if color_scheme == Some("dark") {
    find(&|yiq| yiq < 128.0 && yiq > 0.0)
      .or_else(|| find(&|yiq| yiq < 180.0))
      .unwrap_or("#1A1A1A")
  } else {
    find(&|yiq| yiq > 180.0).unwrap_or("#FFFFFF")
  };
  inferred.to_string()
}

/// The color text is written in: the most common text color of non-button
/// elements that stands out from the background.
fn readable_text(
  snapshots: &[Snapshot],
  background: &str,
  page_background: Option<&str>,
) -> Option<String> {
  let mut votes = Votes::default();
  for s in snapshots {
    let text = s.text.as_deref().unwrap_or_default();
    if s.is_button || s.visible == Some(false) || js::trim(text).is_empty() {
      continue;
    }
    votes.add(hexify(s.colors.text.as_deref(), page_background), 1.0);
  }
  let background_yiq = contrast_yiq(background);
  votes
    .ranked()
    .into_iter()
    .find(|h| (contrast_yiq(h) - background_yiq).abs() > 100.0)
}

pub fn infer_palette(
  snapshots: &[Snapshot],
  css_colors: &[Option<String>],
  color_scheme: Option<&str>,
  page_background: Option<&str>,
) -> BrandingColors {
  let mut freq = Votes::default();
  freq.add(hexify(page_background, None), 1000.0);
  for s in snapshots {
    let area = js::max(1.0, s.rect.w * s.rect.h);
    let background = hexify(s.colors.background.as_deref(), page_background);
    freq.add(background.clone(), 0.5 + (area + 10.0).log10());
    freq.add(hexify(s.colors.text.as_deref(), page_background), 1.0);
    freq.add(hexify(s.colors.border.as_deref(), page_background), 0.3);
    if s.is_button
      && let Some(background) = background.filter(|x| !is_grayish(x))
    {
      freq.add(
        Some(background),
        if s.has_cta_indicator { 80.0 } else { 25.0 },
      );
    }
  }
  for c in css_colors {
    freq.add(hexify(c.as_deref(), page_background), 0.5);
  }
  let ranked = freq.ranked();

  let background = infer_background(&ranked, color_scheme, page_background);
  let primary = pick_brand_primary(&ranked, Some(&background), None, color_scheme);
  let dark = color_scheme == Some("dark");
  let text_primary = readable_text(snapshots, &background, page_background)
    .or_else(|| {
      ranked
        .iter()
        .find(|h| **h != primary && !h.eq_ignore_ascii_case("#FFFFFF") && contrast_yiq(h) < 160.0)
        .cloned()
    })
    .unwrap_or_else(|| if dark { "#FFFFFF" } else { "#111111" }.to_string());
  let accent = ranked
    .iter()
    .find(|h| **h != primary && !is_grayish(h) && !(!dark && is_near_black(h)))
    .unwrap_or(&primary)
    .clone();
  let secondary = ranked
    .iter()
    .find(|h| !is_grayish(h) && **h != primary && **h != accent && **h != background)
    .cloned();

  BrandingColors {
    primary,
    secondary,
    link: accent.clone(),
    accent,
    background,
    text_primary,
  }
}
