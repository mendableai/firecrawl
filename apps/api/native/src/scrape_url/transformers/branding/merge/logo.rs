//! The logo half of TS `mergeBrandingResults`: accept the chosen logo unless it looks like UI.

use super::super::enhancement::{LLM_FAILED, LlmLogoSelection};
use super::super::js;
use super::super::profile::{BrandingImages, BrandingProfile, LogoReasoning};
use super::super::types::LogoCandidate;

const LANGUAGE_WORDS: [&str; 22] = [
  "english",
  "español",
  "français",
  "deutsch",
  "italiano",
  "português",
  "中文",
  "日本語",
  "한국어",
  "русский",
  "العربية",
  "en",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "zh",
  "ja",
  "ko",
  "ru",
  "ar",
];
const MENU_WORDS: [&str; 20] = [
  "menu", "search", "cart", "login", "signup", "register", "account", "profile", "settings",
  "help", "support", "contact", "about", "home", "shop", "store", "products", "services", "blog",
  "news",
];
const UI_ICON_WORDS: [&str; 11] = [
  "search",
  "icon",
  "menu",
  "hamburger",
  "cart",
  "user",
  "bell",
  "notification",
  "settings",
  "close",
  "times",
];
const EXTERNAL_SERVICES: [&str; 5] = [
  "github.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "linkedin.com",
];

fn is_external_link(href: &str) -> bool {
  let href = js::trim(href).to_lowercase();
  let absolute = ["http://", "https://", "//"]
    .iter()
    .any(|p| href.starts_with(p));
  absolute && EXTERNAL_SERVICES.iter().any(|domain| href.contains(domain))
}

/// Why the logo is not a brand mark, empty when nothing is wrong.
fn red_flags(
  logo: &LogoCandidate,
  confidence: f64,
  heuristic_or_fallback: bool,
) -> Vec<&'static str> {
  let alt = js::trim(&logo.alt.to_lowercase()).to_string();
  let (width, height) = (logo.position.width, logo.position.height);
  let small_square = (width - height).abs() < 5.0 && width < 40.0 && width > 0.0;
  let small_square_ui = small_square && !(confidence >= 0.7 && logo.indicators.in_header);

  let mut flags = Vec::new();
  if LANGUAGE_WORDS.contains(&alt.as_str()) {
    flags.push("language word");
  }
  if MENU_WORDS.contains(&alt.as_str()) {
    flags.push("menu word");
  }
  if UI_ICON_WORDS.iter().any(|word| alt.contains(word)) {
    flags.push("UI icon");
  }
  if small_square_ui && !has_strong_indicators(logo) && heuristic_or_fallback {
    flags.push("small square icon");
  }
  if is_external_link(logo.href.as_deref().unwrap_or_default()) {
    flags.push("external link");
  }
  flags
}

/// In the header, linking home, and logo-sized.
fn has_strong_indicators(logo: &LogoCandidate) -> bool {
  let area = logo.position.area();
  logo.indicators.in_header && logo.indicators.href_match && (500.0..=100000.0).contains(&area)
}

fn reject_all(merged: &mut BrandingProfile, selection: &LlmLogoSelection) {
  if let Some(images) = merged.images.as_mut() {
    images.logo = None;
    images.logo_href = None;
    images.logo_alt = None;
  }
  merged.llm_logo_reasoning = Some(LogoReasoning {
    selected_index: -1,
    reasoning: Some(
      selection
        .selected_logo_reasoning
        .clone()
        .filter(|x| !x.is_empty())
        .unwrap_or_else(|| "No valid logo found".to_string()),
    ),
    confidence: if selection.confidence.is_nan() {
      0.0
    } else {
      selection.confidence
    },
    rejected: Some(true),
    source: "llm".to_string(),
  });
}

/// Applies the model's (or the heuristic fallback's) logo pick to the profile.
pub fn merge_logo(
  merged: &mut BrandingProfile,
  selection: &LlmLogoSelection,
  candidates: &[LogoCandidate],
) {
  if selection.selected_logo_index == -1 {
    return reject_all(merged, selection);
  }
  let Some(logo) = usize::try_from(selection.selected_logo_index)
    .ok()
    .and_then(|i| candidates.get(i))
  else {
    return;
  };

  let confidence = if selection.confidence.is_nan() {
    0.0
  } else {
    selection.confidence
  };
  let reasoning = selection
    .selected_logo_reasoning
    .as_deref()
    .unwrap_or_default();
  let heuristic_or_fallback = reasoning.contains("Heuristic")
    || reasoning.contains("heuristic")
    || reasoning == LLM_FAILED
    || reasoning.contains("invalid index");
  let source = if heuristic_or_fallback {
    "heuristic"
  } else {
    "llm"
  }
  .to_string();
  let flags = red_flags(logo, confidence, heuristic_or_fallback);

  if flags.is_empty() && (confidence >= 0.5 || (has_strong_indicators(logo) && confidence >= 0.4)) {
    let images = merged.images.get_or_insert_with(BrandingImages::default);
    images.logo = Some(Some(logo.src.clone()));
    images.logo_href = logo.href.clone().filter(|x| !x.is_empty());
    images.logo_alt = Some(logo.alt.clone()).filter(|x| !x.is_empty());
    merged.llm_logo_reasoning = Some(LogoReasoning {
      selected_index: selection.selected_logo_index,
      reasoning: selection.selected_logo_reasoning.clone(),
      confidence: selection.confidence,
      rejected: None,
      source,
    });
    return;
  }

  let reason = if flags.is_empty() {
    "Low confidence".to_string()
  } else {
    format!("Red flags detected ({})", flags.join(", "))
  };
  let reasoning = js::trim(reasoning);
  merged.llm_logo_reasoning = Some(LogoReasoning {
    selected_index: selection.selected_logo_index,
    reasoning: Some(if reasoning.is_empty() {
      format!("Logo rejected: {reason}.")
    } else {
      format!("Logo rejected: {reason}. {reasoning}")
    }),
    confidence: selection.confidence,
    rejected: Some(true),
    source,
  });
}
