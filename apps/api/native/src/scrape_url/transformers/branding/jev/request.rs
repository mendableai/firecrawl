//! TS `buildJevRequest`'s `state`: what Jev reads about the page.

use std::sync::LazyLock;

use regex::Regex;
use serde::Serialize;

use super::super::js;
use super::super::llm::LlmInput;
use super::super::profile::ButtonSnapshot;
use super::super::types::LogoCandidate;
use super::colors::{ColorCandidate, collect_colors, color_name, describe_color, normalize_hex};
use super::fonts::{FontCandidate, collect_fonts};
use super::ordered::Ordered;
use super::questions::{Question, questions};
use super::{MAX_BUTTONS, MAX_LOGOS, clip};

/// Cookie-consent controls are page chrome, never the site's call to action.
static CONSENT: LazyLock<Option<Regex>> = LazyLock::new(|| {
  Regex::new(
    r"(?i-u)cookie|consent|gdpr|accept all|reject all|allow all|decline|manage (?:preferences|settings)|akzeptieren|ablehnen|accepter|refuser|aceptar|rechazar",
  )
  .ok()
});

#[derive(Serialize)]
pub struct State {
  page: Page,
  #[serde(skip_serializing_if = "Option::is_none")]
  logo_candidates: Option<Ordered<Logo>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  buttons: Option<Ordered<Button>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  colors: Option<Ordered<Color>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  fonts: Option<Ordered<Font>>,
  css: Css,
}

#[derive(Serialize)]
struct Page {
  url: String,
  title: String,
  brand_name_hint: String,
  color_scheme: String,
}

#[derive(Serialize)]
struct Logo {
  r#where: String,
  visible: bool,
  size: String,
  shape: &'static str,
  kind: &'static str,
  alt: String,
  aria_label: String,
  title: String,
  link: &'static str,
  file: String,
  found_via: String,
  heuristic_pick: bool,
}

#[derive(Serialize)]
struct Button {
  text: String,
  background: String,
  text_color: String,
  border: String,
  css_classes: String,
}

#[derive(Serialize)]
struct Color {
  looks: String,
  used_as: Vec<String>,
}

#[derive(Serialize)]
struct Font {
  family: String,
  times_used: u64,
  #[serde(skip_serializing_if = "Option::is_none")]
  used_for: Option<String>,
}

#[derive(Serialize)]
struct Css {
  class_sample: Vec<String>,
  framework_hints: Vec<String>,
}

/// The request body, and what mapping the answers back needs.
pub struct JevRequest {
  pub state: State,
  pub questions: Ordered<Question>,
  pub colors: Vec<ColorCandidate>,
  pub fonts: Vec<FontCandidate>,
  pub logo_count: usize,
  /// Everything merge copies from a button, to group look-alike buttons.
  pub button_styles: Vec<String>,
  /// Merge drops a secondary button whose background matches the primary's.
  pub button_backgrounds: Vec<String>,
}

fn href_kind(href: Option<&str>, page_url: &str, home: bool) -> &'static str {
  let Some(href) = href.filter(|x| !js::trim(x).is_empty()) else {
    return "no link";
  };
  if home {
    return "links to the homepage";
  }
  let Ok(page) = url::Url::parse(page_url) else {
    return "unknown link";
  };
  let Ok(target) = page.join(href) else {
    return "unknown link";
  };
  if target.host_str().unwrap_or_default() == page.host_str().unwrap_or_default() {
    "links to another page on this site"
  } else {
    "links to another website"
  }
}

fn size_label(width: f64, height: f64) -> &'static str {
  let max_side = js::max(width, height);
  let area = width * height;
  match () {
    _ if max_side <= 24.0 || area <= 400.0 => "tiny",
    _ if max_side <= 48.0 || area <= 1800.0 => "small",
    _ if max_side <= 140.0 || area <= 12000.0 => "medium",
    _ if max_side <= 320.0 || area <= 50000.0 => "large",
    _ => "hero-sized",
  }
}

fn file_name(src: &str) -> String {
  if src.starts_with("data:") {
    return "inline SVG".to_string();
  }
  let path = src.split(['?', '#']).next().unwrap_or_default();
  clip(path.rsplit('/').next(), 80)
}

fn logo_state(logo: &LogoCandidate, page_url: &str, heuristic_pick: bool) -> Logo {
  let width = js::round(logo.position.width);
  let height = js::round(logo.position.height);
  let wide = width != 0.0 && height != 0.0 && width / height >= 3.0;
  Logo {
    r#where: logo.location.clone(),
    visible: logo.is_visible,
    size: format!(
      "{}x{} px ({})",
      js::number_to_string(width),
      js::number_to_string(height),
      size_label(width, height)
    ),
    shape: if wide {
      "wide, wordmark-shaped"
    } else {
      "compact"
    },
    kind: if logo.is_svg { "SVG" } else { "image" },
    alt: clip(Some(&logo.alt), 100),
    aria_label: clip(logo.aria_label.as_deref(), 100),
    title: clip(logo.title.as_deref(), 100),
    link: href_kind(logo.href.as_deref(), page_url, logo.indicators.href_match),
    file: file_name(&logo.src),
    found_via: logo.source.clone(),
    heuristic_pick,
  }
}

fn is_consent_button(button: &ButtonSnapshot) -> bool {
  let text = format!("{} {}", button.text, button.classes);
  CONSENT.as_ref().is_some_and(|x| x.is_match(&text))
}

/// TS `buttonStyle`.
fn button_style(b: &ButtonSnapshot) -> String {
  [
    normalize_hex(Some(&b.background)).unwrap_or_else(|| "none".into()),
    normalize_hex(Some(&b.text_color)).unwrap_or_else(|| "none".into()),
    normalize_hex(b.border_color.as_deref()).unwrap_or_else(|| "none".into()),
    b.border_radius.clone(),
    b.shadow.clone().unwrap_or_default(),
  ]
  .join("/")
}

fn css_state(input: &LlmInput, buttons: &[&ButtonSnapshot]) -> Css {
  let mut class_sample: Vec<String> = Vec::new();
  for class in buttons.iter().flat_map(|b| js::split_spaces(&b.classes)) {
    if !class_sample.iter().any(|x| x == class) {
      class_sample.push(class.to_string());
    }
  }
  class_sample.retain(|x| !x.is_empty() && js::len(x) < 50);
  class_sample.truncate(40);
  let framework_hints = input
    .js_branding
    .framework_hints
    .as_ref()
    .and_then(|x| x.as_array())
    .into_iter()
    .flatten()
    .map(|x| clip(x.as_str(), 60))
    .collect();
  Css {
    class_sample,
    framework_hints,
  }
}

fn button_state(b: &ButtonSnapshot) -> Button {
  Button {
    text: clip(Some(&b.text), 80),
    background: color_name(Some(&b.background), "transparent"),
    text_color: color_name(Some(&b.text_color), "unknown"),
    border: color_name(b.border_color.as_deref(), "none"),
    css_classes: clip(Some(&b.classes), 120),
  }
}

fn color_state(c: &ColorCandidate) -> Color {
  Color {
    looks: describe_color(&c.hex),
    used_as: c.usage.iter().take(4).cloned().collect(),
  }
}

fn font_state(f: &FontCandidate) -> Font {
  Font {
    family: f.family.clone(),
    times_used: f.count,
    used_for: f.role.map(|role| format!("{role} text")),
  }
}

/// `{prefix}_0`, `{prefix}_1`, ... as keys; `None` when there is nothing.
fn numbered<S>(prefix: &str, states: impl Iterator<Item = S>) -> Option<Ordered<S>> {
  let entries: Vec<_> = states
    .enumerate()
    .map(|(i, state)| (format!("{prefix}_{i}"), state))
    .collect();
  (!entries.is_empty()).then_some(Ordered(entries))
}

/// TS `buildJevRequest`.
pub fn build_jev_request(input: &LlmInput) -> JevRequest {
  let page_url = input
    .page_url
    .filter(|x| !x.is_empty())
    .unwrap_or(&input.url);
  let logos = &input.logo_candidates[..input.logo_candidates.len().min(MAX_LOGOS)];
  let buttons = &input.buttons[..input.buttons.len().min(MAX_BUTTONS)];
  let colors = collect_colors(input);
  let fonts = collect_fonts(input);
  let heuristic = input.heuristic_pick.as_ref().map(|x| x.index);

  // Ids keep each button's index in the buttons shown, which is what merge reads.
  let cta_buttons: Vec<(String, &ButtonSnapshot)> = buttons
    .iter()
    .enumerate()
    .filter(|(_, button)| !is_consent_button(button))
    .map(|(i, button)| (format!("button_{i}"), *button))
    .collect();
  let button_states = cta_buttons
    .iter()
    .map(|(id, b)| (id.clone(), button_state(b)))
    .collect::<Vec<_>>();

  let state = State {
    page: Page {
      url: page_url.to_string(),
      title: clip(input.page_title, 200),
      brand_name_hint: clip(input.brand_name, 80),
      color_scheme: input
        .js_branding
        .color_scheme
        .clone()
        .unwrap_or_else(|| "unknown".into()),
    },
    logo_candidates: numbered(
      "logo",
      logos
        .iter()
        .enumerate()
        .map(|(i, logo)| logo_state(logo, page_url, heuristic == Some(i))),
    ),
    buttons: (!button_states.is_empty()).then_some(Ordered(button_states)),
    colors: numbered("color", colors.iter().map(color_state)),
    fonts: numbered("font", fonts.iter().map(font_state)),
    css: css_state(input, buttons),
  };
  let button_ids: Vec<String> = cta_buttons.into_iter().map(|(id, _)| id).collect();
  JevRequest {
    questions: questions(logos.len(), &button_ids, colors.len(), &fonts),
    state,
    colors,
    fonts,
    logo_count: logos.len(),
    button_styles: buttons.iter().map(|b| button_style(b)).collect(),
    button_backgrounds: buttons.iter().map(|b| b.background.clone()).collect(),
  }
}
