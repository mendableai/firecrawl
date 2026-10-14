//! TS `BrandingScriptReturn`: what the in-page script reports. Every field has
//! a default, and a JSON `null` number reads as 0 like JS arithmetic does.

use serde::{Deserialize, Deserializer, Serialize};
use ts_rs::TS;

fn number<'de, D: Deserializer<'de>>(d: D) -> Result<f64, D::Error> {
  Ok(Option::<f64>::deserialize(d)?.unwrap_or(0.0))
}

fn flag<'de, D: Deserializer<'de>>(d: D) -> Result<bool, D::Error> {
  Ok(Option::<bool>::deserialize(d)?.unwrap_or(false))
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct BrandingScriptReturn {
  pub css_data: CssData,
  pub snapshots: Vec<Snapshot>,
  pub images: Vec<ScriptImage>,
  pub logo_candidates: Option<Vec<LogoCandidate>>,
  pub brand_name: Option<String>,
  pub typography: ScriptTypography,
  pub color_scheme: Option<String>,
  pub page_background: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct CssData {
  pub colors: Vec<Option<String>>,
  pub spacings: Vec<Option<f64>>,
  pub radii: Vec<Option<f64>>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Snapshot {
  pub classes: Option<String>,
  pub text: Option<String>,
  pub rect: Rect,
  pub position: Option<Position>,
  pub visible: Option<bool>,
  pub colors: SnapshotColors,
  pub typography: SnapshotTypography,
  pub radius: Option<f64>,
  pub border_radius: Option<Corners<Option<f64>>>,
  pub shadow: Option<String>,
  #[serde(deserialize_with = "flag")]
  pub is_button: bool,
  #[serde(rename = "hasCTAIndicator", deserialize_with = "flag")]
  pub has_cta_indicator: bool,
  #[serde(deserialize_with = "flag")]
  pub is_input: bool,
  pub input_metadata: Option<InputMetadata>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Rect {
  #[serde(deserialize_with = "number")]
  pub w: f64,
  #[serde(deserialize_with = "number")]
  pub h: f64,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Position {
  #[serde(deserialize_with = "number")]
  pub top: f64,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SnapshotColors {
  pub text: Option<String>,
  pub background: Option<String>,
  pub border: Option<String>,
  pub border_width: Option<f64>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SnapshotTypography {
  pub font_stack: Vec<Option<String>>,
}

/// Per-corner border radius, as the script reports it (px) and as the profile prints it.
#[derive(Debug, Default, Clone, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(rename = "BrandingCorners")]
pub struct Corners<T> {
  pub top_left: T,
  pub top_right: T,
  pub bottom_right: T,
  pub bottom_left: T,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct InputMetadata {
  pub r#type: String,
  pub placeholder: String,
  pub label: String,
  pub name: String,
  #[serde(deserialize_with = "flag")]
  pub required: bool,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct ScriptImage {
  pub r#type: String,
  pub src: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct ScriptTypography {
  pub stacks: BrandingFontStacks,
  pub sizes: BrandingFontSizes,
}

#[derive(Debug, Default, Clone, Deserialize, Serialize, TS)]
#[serde(default)]
pub struct BrandingFontStacks {
  pub body: Vec<String>,
  pub heading: Vec<String>,
  pub paragraph: Vec<String>,
}

#[derive(Debug, Default, Clone, Deserialize, Serialize, TS)]
#[serde(default)]
pub struct BrandingFontSizes {
  pub h1: String,
  pub h2: String,
  pub body: String,
}

/// TS `LogoCandidate`: a logo the script found, or the site-declared mark.
#[derive(Debug, Default, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LogoCandidate {
  pub src: String,
  pub alt: String,
  #[serde(deserialize_with = "flag")]
  pub is_svg: bool,
  #[serde(deserialize_with = "flag")]
  pub is_visible: bool,
  pub location: String,
  pub position: LogoPosition,
  pub indicators: LogoIndicators,
  pub href: Option<String>,
  pub source: String,
}

#[derive(Debug, Default, Clone, Deserialize)]
#[serde(default)]
pub struct LogoPosition {
  #[serde(deserialize_with = "number")]
  pub top: f64,
  #[serde(deserialize_with = "number")]
  pub left: f64,
  #[serde(deserialize_with = "number")]
  pub width: f64,
  #[serde(deserialize_with = "number")]
  pub height: f64,
}

impl LogoPosition {
  /// TS `calculateLogoArea`.
  pub fn area(&self) -> f64 {
    self.width * self.height
  }
}

#[derive(Debug, Default, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LogoIndicators {
  #[serde(deserialize_with = "flag")]
  pub in_header: bool,
  #[serde(deserialize_with = "flag")]
  pub alt_match: bool,
  #[serde(deserialize_with = "flag")]
  pub src_match: bool,
  #[serde(deserialize_with = "flag")]
  pub class_match: bool,
  #[serde(deserialize_with = "flag")]
  pub href_match: bool,
}
