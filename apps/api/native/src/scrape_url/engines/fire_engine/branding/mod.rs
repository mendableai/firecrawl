//! The in-page script behind the branding format.

use super::super::super::actions::{Action, InternalAction, InternalActionMetadata};

/// TS `getBrandingScript()` as the API's production build serves it.
/// Regenerate with `pnpm branding-script` after changing the TS sources.
const BRANDING_SCRIPT: &str = include_str!("script.js");

/// TS's internal `executeJavascript` action that collects the raw branding data.
pub fn branding_action() -> InternalAction {
  InternalAction {
    action: Action::ExecuteJavascript {
      script: BRANDING_SCRIPT.to_string(),
    },
    real_viewport: Some(true),
    metadata: Some(InternalActionMetadata {
      __firecrawl_internal: Some(true),
    }),
  }
}
