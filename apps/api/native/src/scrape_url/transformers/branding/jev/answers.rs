//! TS `mapJevAnswers`: Jev's picks mapped back onto the enhancement the model
//! call returns.

use std::collections::HashMap;

use serde::Deserialize;
use serde_json::json;

use super::super::enhancement::{
  BrandingEnhancement, ButtonClassification, CleanedFont, ColorRoles, LlmLogoSelection,
};
use super::super::js;
use super::NONE;
use super::fonts::FALLBACK_FONTS;
use super::ordered::Ordered;
use super::request::JevRequest;

/// Below this a color role keeps the heuristic value.
const ROLE_MIN_CONFIDENCE: f64 = 0.35;

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Answer {
  Choice(ChoiceAnswer),
  Noul {
    noul: f64,
  },
  #[serde(other)]
  Other,
}

#[derive(Deserialize)]
pub struct ChoiceAnswer {
  choice: String,
  confidence: f64,
  probabilities: Ordered<f64>,
}

pub type Answers = HashMap<String, Answer>;

pub struct JevBrandingResult {
  pub enhancement: BrandingEnhancement,
  /// Confidence of the logo pick; `None` when there were no candidates.
  pub logo_confidence: Option<f64>,
}

fn choice_of<'a>(answers: &'a Answers, key: &str) -> Option<&'a ChoiceAnswer> {
  match answers.get(key) {
    Some(Answer::Choice(x)) => Some(x),
    _ => None,
  }
}

/// The likeliest option the filter keeps; the first of equals wins, as after
/// TS's stable sort.
fn best_excluding(answer: &ChoiceAnswer, exclude: impl Fn(&str) -> bool) -> Option<&str> {
  let mut best: Option<(&str, f64)> = None;
  for (option, p) in &answer.probabilities.0 {
    if !exclude(option) && best.is_none_or(|(_, b)| *p > b) {
      best = Some((option, *p));
    }
  }
  best.map(|(option, _)| option)
}

fn index_of(option: Option<&str>, prefix: &str) -> i64 {
  option
    .and_then(|x| x.strip_prefix(prefix)?.strip_prefix('_'))
    .and_then(|x| x.parse().ok())
    .unwrap_or(-1)
}

fn at<T>(items: &[T], index: i64) -> Option<&T> {
  usize::try_from(index).ok().and_then(|i| items.get(i))
}

/// `p=0.42` for the option's probability.
fn reasoning(tag: &str, answer: Option<&ChoiceAnswer>, option: Option<&str>) -> String {
  let p = answer
    .zip(option)
    .and_then(|(a, o)| a.probabilities.get(o))
    .map_or_else(|| "n/a".to_string(), |p| js::to_fixed(*p, 2));
  format!("{tag}: p={p}")
}

/// The output keeps only the button's style, so choosing between identical
/// buttons is not uncertainty: their probabilities add up.
fn style_probability(request: &JevRequest, answer: &ChoiceAnswer) -> f64 {
  let chosen = index_of(Some(&answer.choice), "button");
  if chosen < 0 {
    return 0.0;
  }
  let style = at(&request.button_styles, chosen);
  answer
    .probabilities
    .0
    .iter()
    .filter(|(option, _)| at(&request.button_styles, index_of(Some(option), "button")) == style)
    .fold(0.0, |sum, (_, p)| sum + p)
}

fn buttons(request: &JevRequest, answers: &Answers, tag: &str) -> ButtonClassification {
  let primary = choice_of(answers, "primary_button");
  let secondary = choice_of(answers, "secondary_button");
  let primary_index = index_of(primary.map(|x| x.choice.as_str()), "button");
  // Merge drops a secondary with the primary's background, so skip every
  // look-alike, not just the primary itself.
  let primary_background = at(&request.button_backgrounds, primary_index);
  let looks_like_primary = |option: &str| {
    primary.is_some_and(|p| p.choice == option)
      || primary_background.is_some_and(|bg| {
        at(
          &request.button_backgrounds,
          index_of(Some(option), "button"),
        ) == Some(bg)
      })
  };
  let mut secondary_option = secondary.map(|x| x.choice.as_str());
  if let (Some(answer), Some(option)) = (secondary, secondary_option)
    && !option.is_empty()
    && looks_like_primary(option)
  {
    secondary_option = best_excluding(answer, looks_like_primary);
  }
  ButtonClassification {
    primary_button_index: primary_index,
    primary_button_reasoning: reasoning(tag, primary, primary.map(|x| x.choice.as_str())),
    secondary_button_index: index_of(secondary_option, "button"),
    secondary_button_reasoning: reasoning(tag, secondary, secondary_option),
    confidence: primary.map_or(0.0, |p| {
      js::max(p.confidence, style_probability(request, p))
    }),
  }
}

fn color_roles(request: &JevRequest, answers: &Answers) -> ColorRoles {
  let hex = |option: Option<&str>| {
    let i = index_of(option, "color");
    at(&request.colors, i).map(|c| c.hex.clone())
  };
  let primary = choice_of(answers, "primary_color");
  let background = choice_of(answers, "background_color");
  let text = choice_of(answers, "text_color");
  let accent = choice_of(answers, "accent_color");
  let secondary = choice_of(answers, "secondary_color");
  // Text must differ from the background, the secondary from the primary.
  let mut text_option = text.map(|x| x.choice.as_str());
  if let (Some(answer), Some(bg)) = (text, background)
    && answer.choice == bg.choice
  {
    text_option = best_excluding(answer, |o| o == bg.choice);
  }
  let mut secondary_option = secondary.map(|x| x.choice.as_str());
  if let (Some(answer), Some(primary)) = (secondary, primary)
    && answer.choice == primary.choice
  {
    secondary_option = best_excluding(answer, |o| o == primary.choice);
  }
  // A role Jev is unsure of is left empty so the heuristic value stays.
  let role = |answer: Option<&ChoiceAnswer>, option: Option<&str>| {
    answer
      .filter(|a| a.confidence >= ROLE_MIN_CONFIDENCE)
      .and_then(|_| hex(option))
      .unwrap_or_default()
  };
  let confidences: Vec<f64> = [primary, background, text]
    .into_iter()
    .flatten()
    .map(|a| a.confidence)
    .collect();
  ColorRoles {
    primary_color: role(primary, primary.map(|x| x.choice.as_str())),
    secondary_color: Some(role(secondary, secondary_option)),
    accent_color: role(accent, accent.map(|x| x.choice.as_str())),
    background_color: role(background, background.map(|x| x.choice.as_str())),
    text_primary: role(text, text_option),
    // Merge applies the roles at >= 0.5. Jev's confidences are calibrated, so
    // average them instead of letting the least certain role veto all.
    confidence: if confidences.is_empty() {
      0.0
    } else {
      confidences.iter().fold(0.0, |a, b| a + b) / confidences.len() as f64
    },
  }
}

/// The fonts Jev calls real typefaces, most used first, without fallback
/// faces the page doesn't use and, once headings or body are covered, fonts
/// nobody could place.
fn cleaned_fonts(request: &JevRequest, answers: &Answers) -> Vec<CleanedFont> {
  let real: Vec<(CleanedFont, bool)> = request
    .fonts
    .iter()
    .enumerate()
    .filter(|(i, _)| match answers.get(&format!("font_{i}_is_brand")) {
      Some(Answer::Noul { noul }) => *noul >= 0.5,
      _ => true,
    })
    .map(|(i, font)| {
      let asked = choice_of(answers, &format!("font_{i}_role")).map(|x| x.choice.clone());
      let role = font
        .role
        .map(str::to_string)
        .or(asked)
        .unwrap_or_else(|| "unknown".to_string());
      let cleaned = CleanedFont {
        family: font.family.clone(),
        role,
      };
      (cleaned, font.role.is_some())
    })
    .collect();
  let is_fallback = |(f, measured): &(CleanedFont, bool)| {
    !measured && FALLBACK_FONTS.contains(&f.family.to_lowercase().as_str())
  };
  let kept: Vec<_> = if real.iter().any(|f| !is_fallback(f)) {
    real.into_iter().filter(|f| !is_fallback(f)).collect()
  } else {
    real
  };
  let placed = kept
    .iter()
    .any(|(f, _)| f.role == "heading" || f.role == "body");
  kept
    .into_iter()
    .map(|(f, _)| f)
    .filter(|f| !placed || f.role != "unknown")
    .take(5)
    .collect()
}

/// TS `mapJevAnswers`.
pub fn map_jev_answers(request: &JevRequest, model: &str, answers: &Answers) -> JevBrandingResult {
  let tag = format!("jev {model}");
  let tone = choice_of(answers, "tone");
  let energy = choice_of(answers, "energy");
  let audience = choice_of(answers, "audience");
  let framework = choice_of(answers, "framework");
  let library = choice_of(answers, "component_library");

  let personality = tone.zip(energy).map(|(tone, energy)| {
    json!({
      "tone": tone.choice,
      "energy": energy.choice,
      "targetAudience": audience.map(|x| x.choice.as_str()).unwrap_or_default(),
    })
  });
  let design_system = framework.map(|framework| {
    let library = library
      .map(|x| x.choice.as_str())
      .filter(|x| *x != NONE)
      .unwrap_or_default();
    json!({ "framework": framework.choice, "componentLibrary": library })
  });

  let mut logo_confidence = None;
  let logo_selection = (request.logo_count > 0).then(|| {
    let logo = choice_of(answers, "logo");
    let confidence = logo.map_or(0.0, |x| x.confidence);
    logo_confidence = Some(confidence);
    LlmLogoSelection {
      selected_logo_index: index_of(logo.map(|x| x.choice.as_str()), "logo"),
      selected_logo_reasoning: Some(reasoning(&tag, logo, logo.map(|x| x.choice.as_str()))),
      confidence,
    }
  });

  JevBrandingResult {
    enhancement: BrandingEnhancement {
      cleaned_fonts: cleaned_fonts(request, answers),
      button_classification: buttons(request, answers, &tag),
      color_roles: color_roles(request, answers),
      logo_selection,
      personality,
      design_system,
    },
    logo_confidence,
  }
}
