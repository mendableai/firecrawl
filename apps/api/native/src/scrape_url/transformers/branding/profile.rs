//! TS `BrandingProfile`, the document's `branding` field. `__` fields are
//! debug output that only teams with `debugBranding` get back.

use serde::Serialize;
use serde_json::Value;
use ts_rs::TS;

use super::types::{BrandingFontSizes, BrandingFontStacks, Corners};

#[derive(Debug, Clone, Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(optional_fields)]
pub struct BrandingProfile {
  #[serde(skip_serializing_if = "Option::is_none")]
  pub color_scheme: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub fonts: Option<Vec<BrandingFont>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub colors: Option<BrandingColors>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub typography: Option<BrandingTypography>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub spacing: Option<BrandingSpacing>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub components: Option<BrandingComponents>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub images: Option<BrandingImages>,
  #[serde(rename = "__button_snapshots", skip_serializing_if = "Option::is_none")]
  pub button_snapshots: Option<Vec<ButtonSnapshot>>,
  #[serde(rename = "__input_snapshots", skip_serializing_if = "Option::is_none")]
  pub input_snapshots: Option<Vec<InputSnapshot>>,
  #[serde(rename = "__framework_hints", skip_serializing_if = "Option::is_none")]
  pub framework_hints: Option<Value>,
  #[serde(rename = "__logo_candidates", skip_serializing_if = "Option::is_none")]
  pub logo_candidates: Option<Value>,
  #[serde(
    rename = "__llm_logo_reasoning",
    skip_serializing_if = "Option::is_none"
  )]
  pub llm_logo_reasoning: Option<LogoReasoning>,
  #[serde(
    rename = "__llm_button_reasoning",
    skip_serializing_if = "Option::is_none"
  )]
  pub llm_button_reasoning: Option<ButtonReasoning>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub personality: Option<Value>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub design_system: Option<Value>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub confidence: Option<BrandingConfidence>,
  #[serde(rename = "__llm_metadata", skip_serializing_if = "Option::is_none")]
  pub llm_metadata: Option<LlmMetadata>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub brand_name: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub logo: Option<String>,
}

impl BrandingProfile {
  /// Drops every `__` field.
  pub fn strip_debug(&mut self) {
    self.button_snapshots = None;
    self.input_snapshots = None;
    self.framework_hints = None;
    self.logo_candidates = None;
    self.llm_logo_reasoning = None;
    self.llm_button_reasoning = None;
    self.llm_metadata = None;
  }
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(optional_fields)]
pub struct BrandingFont {
  pub family: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub count: Option<u32>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub role: Option<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(optional_fields)]
pub struct BrandingColors {
  pub primary: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub secondary: Option<String>,
  pub accent: String,
  pub background: String,
  pub text_primary: String,
  pub link: String,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct BrandingTypography {
  pub font_families: BrandingFontFamilies,
  pub font_stacks: BrandingFontStacks,
  pub font_sizes: BrandingFontSizes,
}

#[derive(Debug, Clone, Serialize, TS)]
pub struct BrandingFontFamilies {
  pub primary: String,
  pub heading: String,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct BrandingSpacing {
  pub base_unit: u32,
  pub border_radius: String,
}

#[derive(Debug, Clone, Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(optional_fields)]
pub struct BrandingComponents {
  #[serde(skip_serializing_if = "Option::is_none")]
  pub input: Option<InputStyle>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub button_primary: Option<ButtonStyle>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub button_secondary: Option<ButtonStyle>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename = "BrandingInputStyle")]
pub struct InputStyle {
  pub background: String,
  pub text_color: Option<String>,
  pub border_color: Option<String>,
  pub border_radius: String,
  pub border_radius_corners: Corners<String>,
  pub shadow: Option<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(optional_fields)]
#[ts(rename = "BrandingButtonStyle")]
pub struct ButtonStyle {
  pub background: String,
  pub text_color: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub border_color: Option<String>,
  pub border_radius: String,
  pub border_radius_corners: Corners<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub shadow: Option<String>,
}

/// `logo` is absent once a model rejects every candidate, and null when none was found.
#[derive(Debug, Clone, Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct BrandingImages {
  #[serde(skip_serializing_if = "Option::is_none")]
  #[ts(optional)]
  pub logo: Option<Option<String>>,
  pub favicon: Option<String>,
  pub og_image: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  #[ts(optional)]
  pub logo_href: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  #[ts(optional)]
  pub logo_alt: Option<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename = "BrandingButtonSnapshot")]
pub struct ButtonSnapshot {
  pub index: usize,
  pub text: String,
  pub html: String,
  pub classes: String,
  pub background: String,
  pub text_color: String,
  pub border_color: Option<String>,
  pub border_radius: String,
  pub border_radius_corners: Corners<String>,
  pub shadow: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  #[ts(optional)]
  pub top: Option<i64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  #[ts(optional)]
  pub original_background_color: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  #[ts(optional)]
  pub original_text_color: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  #[ts(optional)]
  pub original_border_color: Option<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename = "BrandingInputSnapshot")]
pub struct InputSnapshot {
  pub r#type: String,
  pub placeholder: String,
  pub label: String,
  pub name: String,
  pub required: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  #[ts(optional)]
  pub classes: Option<String>,
  pub background: String,
  pub text_color: Option<String>,
  pub border_color: Option<String>,
  pub border_radius: String,
  pub border_radius_corners: Corners<String>,
  pub shadow: Option<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(optional_fields)]
#[ts(rename = "BrandingLogoReasoning")]
pub struct LogoReasoning {
  pub selected_index: i64,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub reasoning: Option<String>,
  pub confidence: f64,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub rejected: Option<bool>,
  pub source: String,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(rename = "BrandingButtonReasoning")]
pub struct ButtonReasoning {
  pub primary: ButtonPick,
  pub secondary: ButtonPick,
  pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(optional_fields)]
#[ts(rename = "BrandingButtonPick")]
pub struct ButtonPick {
  pub index: i64,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub text: Option<String>,
  pub reasoning: String,
}

#[derive(Debug, Clone, Serialize, TS)]
pub struct BrandingConfidence {
  pub buttons: f64,
  pub colors: f64,
  pub overall: f64,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename = "BrandingLlmMetadata")]
pub struct LlmMetadata {
  pub logo_selection: LlmLogoMetadata,
  pub button_classification: LlmButtonMetadata,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(optional_fields)]
#[ts(rename = "BrandingLlmLogoMetadata")]
pub struct LlmLogoMetadata {
  pub llm_called: bool,
  pub llm_succeeded: bool,
  pub final_source: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub raw_logo_selection: Option<RawLogoSelection>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(optional_fields)]
#[ts(rename = "BrandingRawLogoSelection")]
pub struct RawLogoSelection {
  pub selected_logo_index: i64,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub selected_logo_reasoning: Option<String>,
  pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(optional_fields)]
#[ts(rename = "BrandingLlmButtonMetadata")]
pub struct LlmButtonMetadata {
  pub llm_called: bool,
  pub llm_succeeded: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
}
