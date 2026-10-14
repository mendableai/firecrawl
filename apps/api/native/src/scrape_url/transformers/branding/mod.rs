//! TS `deriveBrandingFromActions`: the brand profile, from what the in-page
//! branding script returned.

mod color;
mod color_roles;
mod enhancement;
mod js;
mod logo;
mod merge;
mod processor;
mod profile;
mod transformer;
mod types;

use serde_json::Value;
use tracing::{Span, field::Empty, instrument};

use self::types::BrandingScriptReturn;
use super::super::{document::Document, formats::FormatKind, meta::Meta};
use super::TransformerError;

pub use self::profile::BrandingProfile;

#[instrument(
  name = "transformers::branding::derive_branding_from_actions",
  skip(meta, document),
  fields(branding.script_returned = Empty),
  err
)]
pub async fn derive_branding_from_actions(
  meta: &Meta,
  mut document: Document,
) -> Result<Document, TransformerError> {
  if !meta.options.formats.contains(FormatKind::Branding) || document.branding.is_some() {
    return Ok(document);
  }
  let returns = document.actions.as_mut().map(|x| &mut x.javascript_returns);
  let index = returns.as_ref().and_then(|returns| {
    returns.iter().position(|x| {
      x.r#type == "object"
        && x
          .value
          .as_object()
          .is_some_and(|v| v.contains_key("branding"))
    })
  });
  Span::current().record("branding.script_returned", index.is_some());
  let (Some(returns), Some(index)) = (returns, index) else {
    return Ok(document);
  };

  let mut raw = returns
    .remove(index)
    .value
    .get_mut("branding")
    .map(Value::take)
    .unwrap_or_default();
  let framework_hints = raw.get_mut("frameworkHints").map(Value::take);
  let logo_candidates = raw.get("logoCandidates").cloned();
  let parsed: BrandingScriptReturn =
    serde_json::from_value(raw).map_err(TransformerError::BrandingScriptReturn)?;
  document.branding = Some(transformer::branding_transformer(
    meta,
    &parsed,
    framework_hints,
    logo_candidates,
  ));
  Ok(document)
}
