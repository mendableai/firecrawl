//! TS `declared-logo.ts`: the logo a site names itself (JSON-LD `logo`, or its
//! largest apple-touch icon), used when the rendered candidates give none.

use super::super::js;
use super::super::types::{LogoCandidate, LogoIndicators, LogoPosition, ScriptImage};

pub struct DeclaredLogo {
  pub src: String,
  pub source: &'static str,
}

pub fn pick_declared_logo(images: &[ScriptImage]) -> Option<DeclaredLogo> {
  ["logo-jsonld", "apple-touch-icon"]
    .into_iter()
    .find_map(|source| {
      images
        .iter()
        .find_map(|i| {
          (i.r#type == source)
            .then(|| i.src.clone())
            .flatten()
            .filter(|x| !x.is_empty())
        })
        .map(|src| DeclaredLogo { src, source })
    })
}

fn is_strong_visible_header_logo(c: &LogoCandidate) -> bool {
  if !c.is_visible || !(c.location == "header" || c.indicators.in_header) {
    return false;
  }
  let i = &c.indicators;
  i.alt_match || i.src_match || i.class_match || i.href_match
}

/// Declared marks join the race only when no strong rendered header logo is in it.
pub fn should_add_declared_logo_candidate(existing: &[LogoCandidate], declared_src: &str) -> bool {
  if existing
    .iter()
    .any(|c| c.src == declared_src && c.is_visible)
  {
    return false;
  }
  !existing.iter().any(is_strong_visible_header_logo)
}

/// A declared mark as a candidate, so it can win selection and not only be the fallback.
pub fn declared_logo_candidate(declared: &DeclaredLogo, brand_name: Option<&str>) -> LogoCandidate {
  let src = &declared.src;
  let lower = src.to_lowercase();
  let is_svg = lower.starts_with("data:image/svg")
    || lower
      .match_indices(".svg")
      .any(|(i, m)| matches!(lower[i + m.len()..].chars().next(), None | Some('?' | '#')));
  LogoCandidate {
    src: src.clone(),
    alt: brand_name.map(js::trim).unwrap_or_default().to_string(),
    aria_label: None,
    title: None,
    is_svg,
    is_visible: true,
    location: "header".to_string(),
    position: LogoPosition {
      top: 0.0,
      left: 0.0,
      width: 180.0,
      height: 180.0,
    },
    indicators: LogoIndicators {
      in_header: true,
      alt_match: false,
      src_match: true,
      class_match: false,
      href_match: true,
    },
    href: None,
    source: declared.source.to_string(),
    logo_svg_score: None,
  }
}
