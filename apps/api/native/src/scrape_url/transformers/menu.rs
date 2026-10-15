//! TS `fetchMenu`: the page's menu, from menu-search.

use std::sync::LazyLock;

use serde_json::Value;
use tracing::{Span, field::Empty, instrument};

use super::super::{document::Document, formats::FormatKind, meta::Meta};
use super::TransformerError;
use super::extraction_service::{ExtractionRequest, ExtractionService};

static MENU_EXTRACTION_SERVICE_URL: LazyLock<Option<String>> = LazyLock::new(|| {
  std::env::var("MENU_EXTRACTION_SERVICE_URL")
    .ok()
    .filter(|x| !x.is_empty())
});

const MENU_SEARCH: ExtractionService = ExtractionService {
  name: "Menu",
  path: "/v1/scrape-menu",
  key: "menu",
};

#[instrument(
  name = "transformers::menu::fetch_menu",
  skip(meta, document),
  fields(outcome = Empty),
  err
)]
pub async fn fetch_menu(meta: &Meta, mut document: Document) -> Result<Document, TransformerError> {
  if !meta.options.formats.contains(FormatKind::Menu) {
    return Ok(document);
  }
  let span = Span::current();
  // During the beta only teams with the menuBeta flag get menus; the rest get nothing, silently.
  let menu_beta = meta
    .internal_options
    .team_flags
    .as_ref()
    .and_then(|x| x.menu_beta);
  if menu_beta != Some(true) {
    span.record("outcome", "no_beta_flag");
    return Ok(document);
  }
  let Some(base_url) = MENU_EXTRACTION_SERVICE_URL.as_deref() else {
    span.record("outcome", "not_configured");
    document.prepend_warning("Menu format is not available (service not configured).");
    return Ok(document);
  };
  let Some(html) = document.raw_html.as_deref() else {
    return Err(TransformerError::CalledOutOfOrder(
      "raw_html is None".to_string(),
    ));
  };

  // Page titles live in the extracted tags unless the parser set one.
  let metadata = &document.metadata;
  let request = ExtractionRequest {
    html,
    url: metadata.url.as_str(),
    title: metadata
      .title
      .as_deref()
      .or_else(|| metadata.extra.get("title").and_then(Value::as_str)),
  };
  match MENU_SEARCH.extract(base_url, &request).await? {
    Some(menu) => {
      span.record("outcome", "found");
      document.menu = Some(menu);
    }
    None => {
      span.record("outcome", "not_found");
      document.prepend_warning("No menu found on this page; it does not appear to be a menu page.");
    }
  }
  Ok(document)
}
