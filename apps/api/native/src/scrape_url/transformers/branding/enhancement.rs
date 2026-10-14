//! TS `BrandingEnhancement`: the model's reading of the page.

use serde_json::Value;

pub struct BrandingEnhancement {
  pub cleaned_fonts: Vec<CleanedFont>,
  pub button_classification: ButtonClassification,
  pub color_roles: ColorRoles,
  pub logo_selection: Option<LlmLogoSelection>,
  pub personality: Option<Value>,
  pub design_system: Option<Value>,
}

pub struct CleanedFont {
  pub family: String,
  pub role: String,
}

pub struct ButtonClassification {
  pub primary_button_index: i64,
  pub primary_button_reasoning: String,
  pub secondary_button_index: i64,
  pub secondary_button_reasoning: String,
  pub confidence: f64,
}

pub struct ColorRoles {
  pub primary_color: String,
  pub secondary_color: Option<String>,
  pub accent_color: String,
  pub background_color: String,
  pub text_primary: String,
  pub confidence: f64,
}

pub struct LlmLogoSelection {
  pub selected_logo_index: i64,
  pub selected_logo_reasoning: Option<String>,
  pub confidence: f64,
}

/// The button reasoning a failed model call reports.
pub const LLM_FAILED: &str = "LLM failed";

impl ButtonClassification {
  /// The schema's default when the answer has no `buttonClassification`.
  pub fn not_returned() -> Self {
    let reasoning = "LLM did not return button classification";
    ButtonClassification {
      primary_button_index: -1,
      primary_button_reasoning: reasoning.to_string(),
      secondary_button_index: -1,
      secondary_button_reasoning: reasoning.to_string(),
      confidence: 0.0,
    }
  }
}

impl BrandingEnhancement {
  /// What TS's `enhanceBrandingWithLLM` answers when the call fails. It has no
  /// logo selection, so the heuristic's pick stands.
  pub fn failed() -> Self {
    BrandingEnhancement {
      cleaned_fonts: Vec::new(),
      button_classification: ButtonClassification {
        primary_button_index: -1,
        primary_button_reasoning: LLM_FAILED.to_string(),
        secondary_button_index: -1,
        secondary_button_reasoning: LLM_FAILED.to_string(),
        confidence: 0.0,
      },
      color_roles: ColorRoles {
        primary_color: String::new(),
        secondary_color: None,
        accent_color: String::new(),
        background_color: String::new(),
        text_primary: String::new(),
        confidence: 0.0,
      },
      logo_selection: None,
      personality: None,
      design_system: None,
    }
  }
}
