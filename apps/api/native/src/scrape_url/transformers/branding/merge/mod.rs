//! TS `mergeBrandingResults`: fold the model's reading into the page's own profile.

mod fonts;
mod logo;

use super::color_roles::{
  color_distance, is_browser_link_color, is_neutral_dark, is_usable_brand_primary,
  normalize_role_hex, should_apply_llm_color_roles,
};
use super::enhancement::{BrandingEnhancement, ButtonClassification, ColorRoles};
use super::js;
use super::profile::{
  BrandingConfidence, BrandingProfile, ButtonPick, ButtonReasoning, ButtonSnapshot, ButtonStyle,
};
use super::types::LogoCandidate;

fn button_style(button: &ButtonSnapshot) -> ButtonStyle {
  ButtonStyle {
    background: button.background.clone(),
    text_color: button.text_color.clone(),
    border_color: button.border_color.clone().filter(|x| !x.is_empty()),
    border_radius: Some(button.border_radius.clone())
      .filter(|x| !x.is_empty())
      .unwrap_or_else(|| "0px".to_string()),
    border_radius_corners: button.border_radius_corners.clone(),
    shadow: button.shadow.clone().filter(|x| !x.is_empty()),
  }
}

fn button_at(buttons: &[ButtonSnapshot], index: i64) -> Option<&ButtonSnapshot> {
  usize::try_from(index).ok().and_then(|i| buttons.get(i))
}

fn merge_buttons(
  merged: &mut BrandingProfile,
  classification: &ButtonClassification,
  buttons: &[ButtonSnapshot],
) {
  if buttons.is_empty() {
    return;
  }
  let pick = |index: i64, reasoning: &str| ButtonPick {
    index,
    text: if index >= 0 {
      button_at(buttons, index).map(|b| b.text.clone())
    } else {
      Some("N/A".to_string())
    },
    reasoning: reasoning.to_string(),
  };
  let (primary_index, secondary_index) = (
    classification.primary_button_index,
    classification.secondary_button_index,
  );
  merged.llm_button_reasoning = Some(ButtonReasoning {
    primary: pick(primary_index, &classification.primary_button_reasoning),
    secondary: pick(secondary_index, &classification.secondary_button_reasoning),
    confidence: classification.confidence,
  });

  let confident = classification.confidence > 0.5;
  if !confident {
    return;
  }
  let primary = button_at(buttons, primary_index);
  if let Some(primary) = primary {
    merged
      .components
      .get_or_insert_with(Default::default)
      .button_primary = Some(button_style(primary));
  }
  if let Some(secondary) = button_at(buttons, secondary_index)
    && primary.is_none_or(|primary| primary.background != secondary.background)
  {
    merged
      .components
      .get_or_insert_with(Default::default)
      .button_secondary = Some(button_style(secondary));
  }
}

fn merge_colors(merged: &mut BrandingProfile, roles: &ColorRoles) {
  let color_scheme = merged.color_scheme.as_deref();
  let Some(colors) = merged.colors.as_mut() else {
    return;
  };
  if !should_apply_llm_color_roles(
    roles.confidence,
    Some(&roles.primary_color),
    Some(&colors.primary),
    color_scheme,
  ) {
    return;
  }

  let brand_hex = |value: Option<&str>| {
    if is_browser_link_color(value) {
      None
    } else {
      normalize_role_hex(value)
    }
  };
  let primary =
    brand_hex(Some(&roles.primary_color)).filter(|x| is_usable_brand_primary(x, color_scheme));
  if let Some(primary) = primary {
    colors.primary = primary;
  }
  let secondary = brand_hex(roles.secondary_color.as_deref());
  let omitted_secondary = js::trim(roles.secondary_color.as_deref().unwrap_or_default()).is_empty();
  if secondary.is_some() || omitted_secondary {
    colors.secondary = secondary;
  }
  if let Some(accent) = brand_hex(Some(&roles.accent_color)) {
    colors.accent = accent;
  }
  if let Some(background) = normalize_role_hex(Some(&roles.background_color)) {
    colors.background = background;
  }
  if let Some(text) = normalize_role_hex(Some(&roles.text_primary)) {
    colors.text_primary = text;
  }
}

/// Monochrome brands use black for their logo and calls to action, which the
/// chrome filters reject on light pages. A near-black primary button says so,
/// unless the chosen primary also fills or outlines a button.
fn prefer_monochrome_primary(merged: &mut BrandingProfile, buttons: &[ButtonSnapshot]) {
  let fill = merged
    .components
    .as_ref()
    .and_then(|c| c.button_primary.as_ref())
    .and_then(|b| normalize_role_hex(Some(&b.background)));
  let color_scheme = merged.color_scheme.as_deref();
  let Some(colors) = merged.colors.as_mut() else {
    return;
  };
  let (Some(fill), Some(primary)) = (fill, normalize_role_hex(Some(&colors.primary))) else {
    return;
  };
  let near = |value: Option<&str>| color_distance(value, Some(&primary)) < 40.0;
  if color_scheme != Some("dark")
    && is_neutral_dark(&fill)
    && primary != fill
    && !buttons
      .iter()
      .any(|b| near(Some(&b.background)) || near(b.border_color.as_deref()))
  {
    colors.primary = fill;
  }
}

pub fn merge_branding_results(
  mut merged: BrandingProfile,
  llm: &BrandingEnhancement,
  buttons: &[ButtonSnapshot],
  logo_candidates: &[LogoCandidate],
) -> BrandingProfile {
  if !logo_candidates.is_empty()
    && let Some(selection) = &llm.logo_selection
  {
    logo::merge_logo(&mut merged, selection, logo_candidates);
  }
  merge_buttons(&mut merged, &llm.button_classification, buttons);
  merge_colors(&mut merged, &llm.color_roles);
  prefer_monochrome_primary(&mut merged, buttons);
  if llm.personality.is_some() {
    merged.personality = llm.personality.clone();
  }
  if llm.design_system.is_some() {
    merged.design_system = llm.design_system.clone();
  }
  fonts::merge_fonts(&mut merged, &llm.cleaned_fonts);

  let (buttons_confidence, colors_confidence) = (
    llm.button_classification.confidence,
    llm.color_roles.confidence,
  );
  merged.confidence = Some(BrandingConfidence {
    buttons: buttons_confidence,
    colors: colors_confidence,
    overall: (buttons_confidence + colors_confidence) / 2.0,
  });
  merged
}
