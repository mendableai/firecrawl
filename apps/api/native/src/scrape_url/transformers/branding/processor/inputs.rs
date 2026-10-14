//! TS `extractInputSnapshots`: the page's most prominent form fields.

use super::super::color::hexify;
use super::super::profile::InputSnapshot;
use super::super::types::{InputMetadata, Snapshot};
use super::{corners, representative_radius};

fn score(meta: &InputMetadata) -> i32 {
  let mut score = match meta.r#type.as_str() {
    "email" => 100,
    "text" => 80,
    "password" => 70,
    "search" => 60,
    "tel" => 50,
    "textarea" => 40,
    "select" => 30,
    _ => 0,
  };
  if meta.required {
    score += 50;
  }
  if !meta.placeholder.is_empty() {
    score += 30;
  }
  if !meta.label.is_empty() {
    score += 40;
  }
  let all_text = format!("{} {} {}", meta.placeholder, meta.label, meta.name).to_lowercase();
  for (word, points) in [
    ("email", 80),
    ("search", 60),
    ("password", 50),
    ("name", 40),
  ] {
    if all_text.contains(word) {
      score += points;
    }
  }
  score
}

/// Up to 20 inputs, most likely to be the page's main form field first.
pub fn input_snapshots(
  snapshots: &[Snapshot],
  page_background: Option<&str>,
) -> Vec<InputSnapshot> {
  let mut inputs: Vec<(&Snapshot, &InputMetadata, i32)> = snapshots
    .iter()
    .filter(|s| s.is_input && !(s.rect.w < 50.0 || s.rect.h < 20.0))
    .filter_map(|s| s.input_metadata.as_ref().map(|meta| (s, meta, score(meta))))
    .collect();
  inputs.sort_by_key(|(_, _, score)| std::cmp::Reverse(*score));

  inputs
    .into_iter()
    .take(20)
    .map(|(s, meta, _)| InputSnapshot {
      r#type: meta.r#type.clone(),
      placeholder: meta.placeholder.clone(),
      label: meta.label.clone(),
      name: meta.name.clone(),
      required: meta.required,
      classes: s.classes.clone(),
      background: hexify(s.colors.background.as_deref(), page_background)
        .unwrap_or_else(|| "transparent".to_string()),
      text_color: hexify(s.colors.text.as_deref(), page_background),
      border_color: s
        .colors
        .border_width
        .is_some_and(|x| x > 0.0)
        .then(|| hexify(s.colors.border.as_deref(), page_background))
        .flatten(),
      border_radius: representative_radius(s.border_radius.as_ref()),
      border_radius_corners: corners(s.border_radius.as_ref()),
      shadow: s.shadow.clone(),
    })
    .collect()
}
