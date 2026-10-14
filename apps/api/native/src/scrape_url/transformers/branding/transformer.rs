//! TS `brandingTransformer`: the page's own profile, with the model's reading folded in.

use std::sync::LazyLock;

use tracing::{Span, field::Empty, instrument};

use super::super::super::{document::Document, meta::Meta};
use super::enhancement::{BrandingEnhancement, LLM_FAILED, LlmLogoSelection};
use super::js;
use super::llm::select::{header_html_chunk, limit_buttons};
use super::llm::{HeuristicPick, LlmInput, enhance_branding_with_llm};
use super::logo::declared::{
  DeclaredLogo, declared_logo_candidate, pick_declared_logo, should_add_declared_logo_candidate,
};
use super::logo::{LogoSelection, select_logo_with_confidence, top_candidates_for_llm};
use super::merge::merge_branding_results;
use super::processor::process_raw_branding;
use super::profile::{
  BrandingImages, BrandingProfile, ButtonSnapshot, LlmButtonMetadata, LlmLogoMetadata, LlmMetadata,
  RawLogoSelection,
};
use super::types::{BrandingScriptReturn, LogoCandidate};

/// zod `stringbool` truthy values.
static DEBUG_BRANDING: LazyLock<bool> = LazyLock::new(|| {
  std::env::var("DEBUG_BRANDING").is_ok_and(|x| {
    matches!(
      x.trim().to_ascii_lowercase().as_str(),
      "true" | "1" | "yes" | "on" | "y" | "enabled"
    )
  })
});

/// Where the logo came from: whether the model's pick held, the source, and why not.
fn logo_outcome(
  llm: &BrandingEnhancement,
  has_candidates: bool,
) -> (bool, &'static str, Option<String>) {
  let Some(selection) = &llm.logo_selection else {
    if !has_candidates {
      return (false, "none", None);
    }
    return (
      false,
      "fallback",
      Some("LLM did not return logo selection".to_string()),
    );
  };
  let reasoning = selection
    .selected_logo_reasoning
    .as_deref()
    .unwrap_or_default();
  let trust_llm = reasoning.contains("LLM picked worse logo")
    || reasoning.contains("Heuristic preferred over LLM");
  let invalid_index =
    reasoning.contains("LLM returned invalid index") || reasoning.contains("invalid index");
  let heuristic_fallback = reasoning.contains("Heuristic fallback")
    || reasoning.contains("Heuristic preferred")
    || invalid_index;
  let invalid_error = || Some("LLM returned invalid logo index".to_string());

  if trust_llm || (reasoning != LLM_FAILED && !heuristic_fallback) {
    return (true, "llm", None);
  }
  if (reasoning.contains("Heuristic") || reasoning.contains("heuristic"))
    && !(invalid_index && selection.selected_logo_index == -1)
  {
    return (
      false,
      "heuristic",
      if invalid_index { invalid_error() } else { None },
    );
  }
  let error = if invalid_index {
    invalid_error()
  } else {
    Some(reasoning.to_string())
  };
  (false, "fallback", error)
}

/// The model's indices, which point into what it was shown, as indices into
/// all buttons and candidates. A logo index it wasn't shown falls back to the
/// heuristic's pick.
fn map_indices(
  llm: &mut BrandingEnhancement,
  shown_logos: &[usize],
  shown_buttons: &[usize],
  heuristic: Option<&LogoSelection>,
) {
  let shown = |map: &[usize], i: i64| usize::try_from(i).ok().and_then(|i| map.get(i).copied());
  if let Some(selection) = llm.logo_selection.as_mut()
    && !shown_logos.is_empty()
  {
    match shown(shown_logos, selection.selected_logo_index) {
      Some(original) => selection.selected_logo_index = original as i64,
      None if selection.selected_logo_index >= 0 => {
        *selection = match heuristic {
          Some(heuristic) => LlmLogoSelection {
            selected_logo_index: heuristic.selected_index,
            selected_logo_reasoning: Some(format!(
              "Heuristic fallback (LLM returned invalid index): {}",
              heuristic.reasoning
            )),
            confidence: js::max(heuristic.confidence - 0.1, 0.3),
          },
          None => LlmLogoSelection {
            selected_logo_index: -1,
            selected_logo_reasoning: Some(
              "No valid logo found - LLM returned invalid index and no heuristic result available"
                .to_string(),
            ),
            confidence: 0.0,
          },
        };
      }
      None => {}
    }
  }
  let buttons = &mut llm.button_classification;
  for index in [
    &mut buttons.primary_button_index,
    &mut buttons.secondary_button_index,
  ] {
    if let Some(original) = shown(shown_buttons, *index) {
      *index = original as i64;
    }
  }
}

/// TS's handling of the model's answer: indices mapped back, the heuristic
/// logo standing in when the model picked none, and `__llm_metadata` saying
/// which source won.
fn settle_llm(
  mut llm: BrandingEnhancement,
  candidates: &[LogoCandidate],
  buttons: usize,
  heuristic: Option<&LogoSelection>,
  shown: (&[usize], &[usize]),
) -> (BrandingEnhancement, LlmMetadata) {
  let classification = &llm.button_classification;
  let button_succeeded =
    classification.primary_button_reasoning != LLM_FAILED && classification.confidence > 0.0;
  let button_error = (!button_succeeded && classification.primary_button_reasoning == LLM_FAILED)
    .then(|| "LLM call failed or returned fallback values".to_string());
  let raw_logo_selection = llm.logo_selection.as_ref().map(|x| RawLogoSelection {
    selected_logo_index: x.selected_logo_index,
    selected_logo_reasoning: x.selected_logo_reasoning.clone(),
    confidence: x.confidence,
  });
  if candidates.is_empty() {
    llm.logo_selection = None;
  }
  map_indices(&mut llm, shown.0, shown.1, heuristic);
  if let Some(heuristic) = heuristic
    && llm.logo_selection.is_none()
  {
    llm.logo_selection = Some(LlmLogoSelection {
      selected_logo_index: heuristic.selected_index,
      selected_logo_reasoning: Some(format!("Heuristic fallback: {}", heuristic.reasoning)),
      confidence: js::max(heuristic.confidence - 0.1, 0.3),
    });
  }
  let (logo_succeeded, logo_source, logo_error) = logo_outcome(&llm, !candidates.is_empty());
  let metadata = LlmMetadata {
    logo_selection: LlmLogoMetadata {
      llm_called: !candidates.is_empty(),
      llm_succeeded: logo_succeeded,
      final_source: logo_source.to_string(),
      error: logo_error,
      raw_logo_selection,
    },
    button_classification: LlmButtonMetadata {
      llm_called: buttons > 0,
      llm_succeeded: button_succeeded,
      error: button_error,
    },
  };
  (llm, metadata)
}

fn selected_logo(profile: &BrandingProfile) -> Option<String> {
  profile
    .images
    .as_ref()
    .and_then(|x| x.logo.clone().flatten())
    .filter(|x| !x.is_empty())
}

/// The declared-logo last resort, debug stripping, and the top-level `brandName` and `logo`.
fn finish(
  meta: &Meta,
  mut profile: BrandingProfile,
  declared: Option<DeclaredLogo>,
  brand_name: Option<String>,
) -> BrandingProfile {
  let span = Span::current();
  if selected_logo(&profile).is_none()
    && let Some(declared) = declared
  {
    span.record("branding.declared_fallback", true);
    profile
      .images
      .get_or_insert_with(BrandingImages::default)
      .logo = Some(Some(declared.src));
  }

  let team_debug = meta
    .internal_options
    .team_flags
    .as_ref()
    .and_then(|x| x.debug_branding);
  let debug = *DEBUG_BRANDING || team_debug == Some(true);
  span.record("branding.debug", debug);
  if !debug {
    profile.strip_debug();
  }
  profile.brand_name = brand_name;
  profile.logo = selected_logo(&profile);
  profile
}

/// Everything the transformer knows about the page, for the model.
struct Page<'a> {
  document: &'a Document,
  raw: &'a BrandingScriptReturn,
  js_branding: &'a BrandingProfile,
  buttons: &'a [ButtonSnapshot],
  candidates: &'a [LogoCandidate],
  brand_name: Option<&'a str>,
}

/// The model's answer, and which logo candidates and buttons it was shown.
async fn ask_model(
  meta: &Meta,
  page: Page<'_>,
  heuristic: Option<&LogoSelection>,
) -> (BrandingEnhancement, Vec<usize>, Vec<usize>) {
  let shown_logos = top_candidates_for_llm(page.candidates, 20);
  let shown_buttons = limit_buttons(page.buttons);
  let heuristic_pick = heuristic.and_then(|h| {
    Some(HeuristicPick {
      index: shown_logos
        .iter()
        .position(|&i| i as i64 == h.selected_index)?,
      confidence: h.confidence,
      reasoning: h.reasoning.clone(),
    })
  });
  let header_html_chunk = page
    .document
    .html
    .as_deref()
    .filter(|_| page.candidates.is_empty())
    .map(header_html_chunk)
    .filter(|x| !x.is_empty());
  let raw = page.raw;
  let non_empty = |x: &Option<String>| x.clone().filter(|x| !x.is_empty());
  let input = LlmInput {
    js_branding: page.js_branding,
    buttons: shown_buttons.iter().map(|&i| &page.buttons[i]).collect(),
    logo_candidates: shown_logos.iter().map(|&i| &page.candidates[i]).collect(),
    brand_name: page.brand_name,
    page_title: raw.page_title.as_deref(),
    page_url: raw.page_url.as_deref(),
    background_candidates: raw.background_candidates.as_deref().unwrap_or_default(),
    screenshot: page.document.screenshot.as_ref().map(|x| x.as_str()),
    url: non_empty(&raw.page_url).unwrap_or_else(|| meta.url.to_string()),
    header_html_chunk,
    favicon: page
      .js_branding
      .images
      .as_ref()
      .and_then(|x| x.favicon.as_deref()),
    heuristic_pick,
  };
  let llm = enhance_branding_with_llm(meta, &input).await;
  (llm, shown_logos, shown_buttons)
}

#[instrument(
  name = "transformers::branding::branding_transformer",
  skip_all,
  fields(
    branding.logo_candidates = Empty,
    branding.buttons = Empty,
    branding.logo_source = Empty,
    branding.declared_fallback = Empty,
    branding.debug = Empty,
  )
)]
pub async fn branding_transformer(
  meta: &Meta,
  document: &Document,
  raw: &BrandingScriptReturn,
  framework_hints: Option<serde_json::Value>,
  raw_logo_candidates: Option<serde_json::Value>,
) -> BrandingProfile {
  let span = Span::current();
  let js_branding = process_raw_branding(raw, framework_hints, raw_logo_candidates);
  let buttons = js_branding.button_snapshots.clone().unwrap_or_default();
  let brand_name = raw
    .brand_name
    .as_deref()
    .map(js::trim)
    .filter(|x| !x.is_empty())
    .map(str::to_string);

  let mut candidates = raw.logo_candidates.clone().unwrap_or_default();
  let declared = pick_declared_logo(&raw.images);
  if let Some(declared) = &declared
    && should_add_declared_logo_candidate(&candidates, &declared.src)
  {
    candidates.push(declared_logo_candidate(declared, brand_name.as_deref()));
  }
  span.record("branding.logo_candidates", candidates.len());
  span.record("branding.buttons", buttons.len());
  let heuristic = (!candidates.is_empty())
    .then(|| select_logo_with_confidence(&candidates, brand_name.as_deref()));

  let page = Page {
    document,
    raw,
    js_branding: &js_branding,
    buttons: &buttons,
    candidates: &candidates,
    brand_name: brand_name.as_deref(),
  };
  let (llm, shown_logos, shown_buttons) = ask_model(meta, page, heuristic.as_ref()).await;
  let (llm, metadata) = settle_llm(
    llm,
    &candidates,
    buttons.len(),
    heuristic.as_ref(),
    (&shown_logos, &shown_buttons),
  );
  span.record(
    "branding.logo_source",
    metadata.logo_selection.final_source.as_str(),
  );

  let mut profile = merge_branding_results(js_branding, &llm, &buttons, &candidates);
  profile.llm_metadata = Some(metadata);
  finish(meta, profile, declared, brand_name)
}
