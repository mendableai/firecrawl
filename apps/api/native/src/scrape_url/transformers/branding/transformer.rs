//! TS `brandingTransformer`: the page's own profile, with a model's reading folded in.

use std::sync::LazyLock;

use tracing::{Span, field::Empty, instrument};

use super::super::super::meta::Meta;
use super::enhancement::{BrandingEnhancement, LLM_FAILED, LlmLogoSelection};
use super::js;
use super::logo::declared::{
  DeclaredLogo, declared_logo_candidate, pick_declared_logo, should_add_declared_logo_candidate,
};
use super::logo::{LogoSelection, select_logo_with_confidence};
use super::merge::merge_branding_results;
use super::processor::process_raw_branding;
use super::profile::{
  BrandingImages, BrandingProfile, LlmButtonMetadata, LlmLogoMetadata, LlmMetadata,
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

/// TS's handling of the model's answer: the heuristic logo stands in when the
/// model picked none, and `__llm_metadata` says which source won.
fn settle_llm(
  mut llm: BrandingEnhancement,
  candidates: &[LogoCandidate],
  buttons: usize,
  heuristic: Option<&LogoSelection>,
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
pub fn branding_transformer(
  meta: &Meta,
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

  // The model call is not ported yet, so every scrape takes TS's failed-call path.
  let (llm, metadata) = settle_llm(
    BrandingEnhancement::failed(),
    &candidates,
    buttons.len(),
    heuristic.as_ref(),
  );
  span.record(
    "branding.logo_source",
    metadata.logo_selection.final_source.as_str(),
  );

  let mut profile = merge_branding_results(js_branding, &llm, &buttons, &candidates);
  profile.llm_metadata = Some(metadata);
  finish(meta, profile, declared, brand_name)
}
