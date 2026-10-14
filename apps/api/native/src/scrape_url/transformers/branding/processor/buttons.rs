//! The button half of TS `processRawBranding`: score, dedupe and describe buttons.

use super::super::super::tokens::utf16_prefix;
use super::super::color::hexify;
use super::super::js;
use super::super::profile::ButtonSnapshot;
use super::super::types::Snapshot;
use super::{corners, representative_radius};

const CTA_KEYWORDS: [&str; 15] = [
  "sign up",
  "get started",
  "start deploying",
  "start",
  "deploy",
  "try",
  "demo",
  "contact",
  "buy",
  "subscribe",
  "join",
  "register",
  "get",
  "free",
  "join",
];

/// Roughly one desktop screen; buttons above it count as more prominent.
const FIRST_SCREEN_PX: f64 = 1000.0;

/// The background and border a button shows, as `#RRGGBB` when readable.
struct Fill {
  background: Option<String>,
  border: Option<String>,
  has_border: bool,
}

impl Fill {
  fn of(s: &Snapshot, page_background: Option<&str>) -> Self {
    let has_border = s.colors.border_width.is_some_and(|x| x > 0.0);
    Fill {
      background: hexify(s.colors.background.as_deref(), page_background),
      border: has_border
        .then(|| hexify(s.colors.border.as_deref(), page_background))
        .flatten(),
      has_border,
    }
  }
}

fn is_candidate(s: &Snapshot, fill: &Fill) -> bool {
  if !s.is_button || s.visible == Some(false) {
    return false;
  }
  if s.rect.w < 30.0 || s.rect.h < 24.0 {
    return false;
  }
  if js::len(js::trim(s.text.as_deref().unwrap_or_default())) == 0 {
    return false;
  }
  fill.background.is_some() || fill.has_border
}

fn score(s: &Snapshot, fill: &Fill) -> f64 {
  let mut score = 0.0;
  if s.has_cta_indicator {
    score += 1000.0;
  }
  let text = s.text.as_deref().unwrap_or_default().to_lowercase();
  if CTA_KEYWORDS.iter().any(|kw| text.contains(kw)) {
    score += 500.0;
  }
  if fill
    .background
    .as_deref()
    .is_some_and(|bg| !matches!(bg, "#FFFFFF" | "#FAFAFA" | "#F5F5F5"))
  {
    score += 300.0;
  }
  if fill.border.is_some() && fill.background.is_none() {
    score += 200.0;
  }
  let len = js::len(&text);
  if len > 0 && len < 50 {
    score += 100.0;
  }
  score += (s.rect.w * s.rect.h + 1.0).log10() * 10.0;
  if s.position.as_ref().is_some_and(|p| p.top < FIRST_SCREEN_PX) {
    score += 150.0;
  }
  score
}

/// Same text, fill, border and leading classes means the same button.
fn signature(s: &Snapshot, fill: &Fill) -> String {
  let text = js::trim(s.text.as_deref().unwrap_or_default()).to_lowercase();
  let classes = js::split_spaces(s.classes.as_deref().unwrap_or_default())
    .into_iter()
    .take(5)
    .collect::<Vec<_>>()
    .join(" ")
    .to_lowercase();
  let border = match (&fill.border, fill.has_border) {
    (Some(border), _) => border.as_str(),
    (None, true) => "transparent-border",
    (None, false) => "no-border",
  };
  format!(
    "{}|{}|{border}|{classes}",
    utf16_prefix(&text, 50),
    fill.background.as_deref().unwrap_or("transparent"),
  )
}

fn describe(
  index: usize,
  s: &Snapshot,
  fill: Fill,
  page_background: Option<&str>,
) -> ButtonSnapshot {
  let non_empty = |x: &Option<String>| x.clone().filter(|x| !x.is_empty());
  ButtonSnapshot {
    index,
    text: s.text.clone().unwrap_or_default(),
    html: String::new(),
    classes: s.classes.clone().unwrap_or_default(),
    background: fill.background.unwrap_or_else(|| "transparent".to_string()),
    text_color: hexify(s.colors.text.as_deref(), page_background)
      .unwrap_or_else(|| "#000000".to_string()),
    border_color: fill.border,
    border_radius: representative_radius(s.border_radius.as_ref()),
    border_radius_corners: corners(s.border_radius.as_ref()),
    shadow: non_empty(&s.shadow),
    top: s.position.as_ref().map(|p| js::round(p.top) as i64),
    original_background_color: non_empty(&s.colors.background),
    original_text_color: non_empty(&s.colors.text),
    original_border_color: non_empty(&s.colors.border),
  }
}

/// Up to 80 distinct buttons, most prominent first.
pub fn button_snapshots(
  snapshots: &[Snapshot],
  page_background: Option<&str>,
) -> Vec<ButtonSnapshot> {
  let mut candidates: Vec<(&Snapshot, Fill, f64)> = snapshots
    .iter()
    .filter_map(|s| {
      let fill = Fill::of(s, page_background);
      is_candidate(s, &fill).then(|| {
        let score = score(s, &fill);
        (s, fill, score)
      })
    })
    .collect();
  candidates.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));

  let mut seen = std::collections::HashSet::new();
  candidates
    .into_iter()
    .filter(|(s, fill, _)| seen.insert(signature(s, fill)))
    .take(80)
    .enumerate()
    .map(|(index, (s, fill, _))| describe(index, s, fill, page_background))
    .collect()
}
