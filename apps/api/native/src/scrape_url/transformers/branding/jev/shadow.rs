//! TS `jev-shadow.ts`: for a share of the requests the model answered, ask Jev
//! the same questions in the background and record on a span how the two
//! answers would differ in the response. Customers always get the model's.

use std::collections::HashSet;
use std::sync::atomic::{AtomicUsize, Ordering};

use serde_json::Value;
use tracing::{Instrument, Span, field::Empty};

use super::super::super::super::cost_tracking::CostTracking;
use super::super::super::super::meta::Meta;
use super::super::color;
use super::super::enhancement::BrandingEnhancement;
use super::super::llm::{HeuristicPick, LlmInput};
use super::super::merge::merge_branding_results;
use super::super::profile::{BrandingProfile, ButtonSnapshot, ButtonStyle};
use super::super::types::LogoCandidate;
use super::config::{API_KEY, SHADOW_PERCENT, random};
use super::{breaker, enhance_branding_with_jev};

/// Colors closer than this (CIEDE2000) count as the same; brand-bench's
/// default tolerance is 12.
const SAME_COLOR_DELTA_E: f64 = 10.0;
/// Backstop for traffic bursts: past this many shadow calls in flight, skip.
const MAX_IN_FLIGHT: usize = 50;

static IN_FLIGHT: AtomicUsize = AtomicUsize::new(0);

struct InFlight;

impl Drop for InFlight {
  fn drop(&mut self) {
    IN_FLIGHT.fetch_sub(1, Ordering::Relaxed);
  }
}

/// TS `shouldShadowJev`. Zero data retention scrapes are skipped: the shadow
/// is extra work on customer content their response doesn't need.
pub fn should_shadow_jev(meta: &Meta) -> bool {
  API_KEY.is_some()
    && !meta.internal_options.zero_data_retention
    && *SHADOW_PERCENT > 0.0
    && IN_FLIGHT.load(Ordering::Relaxed) < MAX_IN_FLIGHT
    && !breaker::is_open()
    && random() * 100.0 < *SHADOW_PERCENT
}

/// What Jev and the comparison read, copied: the scrape goes on without it.
/// Jev reads neither the screenshot nor the header HTML.
struct Snapshot {
  js_branding: BrandingProfile,
  buttons: Vec<ButtonSnapshot>,
  logo_candidates: Vec<LogoCandidate>,
  brand_name: Option<String>,
  page_title: Option<String>,
  page_url: Option<String>,
  background_candidates: Vec<Value>,
  url: String,
  heuristic_pick: Option<HeuristicPick>,
}

impl Snapshot {
  fn new(input: &LlmInput) -> Self {
    Snapshot {
      js_branding: input.js_branding.clone(),
      buttons: input.buttons.iter().map(|&x| x.clone()).collect(),
      logo_candidates: input.logo_candidates.iter().map(|&x| x.clone()).collect(),
      brand_name: input.brand_name.map(str::to_string),
      page_title: input.page_title.map(str::to_string),
      page_url: input.page_url.map(str::to_string),
      background_candidates: input.background_candidates.to_vec(),
      url: input.url.clone(),
      heuristic_pick: input.heuristic_pick.clone(),
    }
  }

  fn input(&self) -> LlmInput<'_> {
    LlmInput {
      js_branding: &self.js_branding,
      buttons: self.buttons.iter().collect(),
      logo_candidates: self.logo_candidates.iter().collect(),
      brand_name: self.brand_name.as_deref(),
      page_title: self.page_title.as_deref(),
      page_url: self.page_url.as_deref(),
      background_candidates: &self.background_candidates,
      screenshot: None,
      url: self.url.clone(),
      header_html_chunk: None,
      favicon: None,
      heuristic_pick: self.heuristic_pick.clone(),
    }
  }

  fn merged(&self, answer: &BrandingEnhancement) -> BrandingProfile {
    merge_branding_results(
      self.js_branding.clone(),
      answer,
      &self.buttons,
      &self.logo_candidates,
    )
  }
}

fn same_color(a: Option<&str>, b: Option<&str>) -> bool {
  let (a, b) = (a.filter(|x| !x.is_empty()), b.filter(|x| !x.is_empty()));
  if a.is_none() && b.is_none() {
    return true;
  }
  match (a.and_then(color::parse), b.and_then(color::parse)) {
    (Some(a), Some(b)) => color::ciede2000(&a, &b) <= SAME_COLOR_DELTA_E,
    _ => false,
  }
}

/// Everything the response carries for a button.
fn same_button(a: Option<&ButtonStyle>, b: Option<&ButtonStyle>) -> bool {
  let (a, b) = match (a, b) {
    (None, None) => return true,
    (Some(a), Some(b)) => (a, b),
    _ => return false,
  };
  let text = |x: Option<&str>| x.filter(|x| !x.is_empty()).unwrap_or("none").to_string();
  same_color(Some(&a.background), Some(&b.background))
    && same_color(Some(&a.text_color), Some(&b.text_color))
    && same_color(a.border_color.as_deref(), b.border_color.as_deref())
    && text(Some(&a.border_radius)) == text(Some(&b.border_radius))
    && text(a.shadow.as_deref()) == text(b.shadow.as_deref())
}

/// Merge keeps the page's own fonts when an answer cleans none, so compare
/// the merged profiles, not the raw answers.
fn font_overlap(a: &BrandingProfile, b: &BrandingProfile) -> f64 {
  let names = |p: &BrandingProfile| -> HashSet<String> {
    p.fonts
      .iter()
      .flatten()
      .map(|f| f.family.to_lowercase())
      .collect()
  };
  let (x, y) = (names(a), names(b));
  let union = x.union(&y).count();
  if union == 0 {
    return 1.0;
  }
  x.intersection(&y).count() as f64 / union as f64
}

fn button(p: &BrandingProfile, primary: bool) -> Option<&ButtonStyle> {
  let components = p.components.as_ref()?;
  if primary {
    components.button_primary.as_ref()
  } else {
    components.button_secondary.as_ref()
  }
}

fn logo(p: &BrandingProfile) -> Option<&str> {
  p.images.as_ref()?.logo.as_ref()?.as_deref()
}

/// TS `compareBrandingAnswers`: agreement on what the response would carry
/// after merge, recorded on the shadow span.
fn record_comparison(
  span: &Span,
  snapshot: &Snapshot,
  llm: &BrandingEnhancement,
  jev: &BrandingEnhancement,
) {
  let (a, b) = (snapshot.merged(llm), snapshot.merged(jev));
  let mut flags = Vec::new();
  let mut flag = |name: &'static str, agree: bool| {
    span.record(name, agree);
    flags.push(agree);
  };
  if !snapshot.logo_candidates.is_empty() {
    flag("branding.shadow.logo_agree", logo(&a) == logo(&b));
  }
  flag(
    "branding.shadow.button_primary_agree",
    same_button(button(&a, true), button(&b, true)),
  );
  flag(
    "branding.shadow.button_secondary_agree",
    same_button(button(&a, false), button(&b, false)),
  );
  let roles = |p: &BrandingProfile| {
    let c = p.colors.as_ref()?;
    Some([&c.primary, &c.accent, &c.background, &c.text_primary].map(|x| x.clone()))
  };
  let (ra, rb) = (roles(&a), roles(&b));
  let names = [
    "branding.shadow.color_primary_agree",
    "branding.shadow.color_accent_agree",
    "branding.shadow.color_background_agree",
    "branding.shadow.color_textPrimary_agree",
  ];
  for (i, name) in names.into_iter().enumerate() {
    let pick = |r: &Option<[String; 4]>| r.as_ref().map(|r| r[i].clone());
    flag(name, same_color(pick(&ra).as_deref(), pick(&rb).as_deref()));
  }
  span.record("branding.shadow.fonts_overlap", font_overlap(&a, &b));
  span.record("branding.shadow.fields_compared", flags.len());
  span.record(
    "branding.shadow.fields_agreeing",
    flags.iter().filter(|x| **x).count(),
  );
}

/// TS `shadowJev`: starts the shadow call and returns at once.
pub fn shadow_jev(meta: &Meta, input: &LlmInput, llm: &BrandingEnhancement, llm_model: &str) {
  let snapshot = Snapshot::new(input);
  let llm = llm.clone();
  IN_FLIGHT.fetch_add(1, Ordering::Relaxed);
  let span = tracing::info_span!(
    "transformers::branding::jev_shadow",
    branding.shadow.llm_model = llm_model,
    branding.shadow.team_id = Some(meta.team_id.as_str()).filter(|x| !x.is_empty()),
    branding.shadow.outcome = Empty,
    branding.shadow.jev_logo_confidence = Empty,
    branding.shadow.logo_agree = Empty,
    branding.shadow.button_primary_agree = Empty,
    branding.shadow.button_secondary_agree = Empty,
    branding.shadow.color_primary_agree = Empty,
    branding.shadow.color_accent_agree = Empty,
    branding.shadow.color_background_agree = Empty,
    branding.shadow.color_textPrimary_agree = Empty,
    branding.shadow.fonts_overlap = Empty,
    branding.shadow.fields_compared = Empty,
    branding.shadow.fields_agreeing = Empty,
  );
  tokio::spawn(
    async move {
      let _in_flight = InFlight;
      let span = Span::current();
      // Kept apart from the scrape's own cost record and cost limit.
      let cost_tracking = CostTracking::default();
      let Some(jev) = enhance_branding_with_jev(&snapshot.input(), &cost_tracking, true).await
      else {
        span.record("branding.shadow.outcome", "jev_failed");
        return;
      };
      record_comparison(&span, &snapshot, &llm, &jev.enhancement);
      span.record("branding.shadow.outcome", "compared");
      if let Some(confidence) = jev.logo_confidence {
        span.record("branding.shadow.jev_logo_confidence", confidence);
      }
    }
    .instrument(span),
  );
}
