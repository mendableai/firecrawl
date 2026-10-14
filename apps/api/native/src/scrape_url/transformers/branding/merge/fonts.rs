//! The font half of TS `mergeBrandingResults`: swap raw font stacks for the model's clean names.

use std::collections::HashSet;
use std::sync::LazyLock;

use regex::Regex;

use super::super::enhancement::CleanedFont;
use super::super::profile::{BrandingFont, BrandingProfile};

/// next/font's generated family names, e.g. `__Inter_Fallback_a1b2c3d4`.
static NEXT_FONT: LazyLock<Option<Regex>> =
  LazyLock::new(|| Regex::new(r"(?i)^__(.+?)(?:_Fallback)?_[a-f0-9]{8}$").ok());

fn clean_font_name(font: &str, cleaned: &[CleanedFont]) -> String {
  let lower = font.to_lowercase();
  let extracted = NEXT_FONT
    .as_ref()
    .and_then(|re| re.captures(font))
    .and_then(|c| c.get(1))
    .map(|m| m.as_str().to_lowercase());
  for cleaned_font in cleaned {
    let cleaned_lower = cleaned_font.family.to_lowercase();
    if lower.contains(&cleaned_lower) {
      return cleaned_font.family.clone();
    }
    if let Some(extracted) = &extracted
      && (*extracted == cleaned_lower || cleaned_lower.contains(extracted.as_str()))
    {
      return cleaned_font.family.clone();
    }
  }
  font.to_string()
}

fn clean_stack(stack: &mut Vec<String>, cleaned: &[CleanedFont]) {
  let mut seen = HashSet::new();
  *stack = stack
    .iter()
    .map(|font| clean_font_name(font, cleaned))
    .filter(|font| seen.insert(font.to_lowercase()))
    .collect();
}

pub fn merge_fonts(merged: &mut BrandingProfile, cleaned: &[CleanedFont]) {
  let Some(first) = cleaned.first() else {
    return;
  };
  merged.fonts = Some(
    cleaned
      .iter()
      .map(|f| BrandingFont {
        family: f.family.clone(),
        count: None,
        role: Some(f.role.clone()),
      })
      .collect(),
  );
  let Some(typography) = merged.typography.as_mut() else {
    return;
  };

  let stacks = &mut typography.font_stacks;
  clean_stack(&mut stacks.heading, cleaned);
  clean_stack(&mut stacks.body, cleaned);
  clean_stack(&mut stacks.paragraph, cleaned);

  let role = |role: &str| cleaned.iter().find(|f| f.role == role);
  let primary = role("body").unwrap_or(first);
  let heading = role("heading")
    .or_else(|| role("display"))
    .unwrap_or(primary);
  typography.font_families.primary = primary.family.clone();
  typography.font_families.heading = heading.family.clone();
}
