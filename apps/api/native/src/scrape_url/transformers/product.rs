//! TS `fetchProduct`: the page's product profile, from product-search.

use std::sync::LazyLock;

use tracing::{Span, field::Empty, instrument};

use super::super::{document::Document, formats::FormatKind, meta::Meta};
use super::TransformerError;
use super::extraction_service::{ExtractionRequest, ExtractionService};

static PRODUCT_EXTRACTION_SERVICE_URL: LazyLock<Option<String>> = LazyLock::new(|| {
  std::env::var("PRODUCT_EXTRACTION_SERVICE_URL")
    .ok()
    .filter(|x| !x.is_empty())
});

const PRODUCT_SEARCH: ExtractionService = ExtractionService {
  name: "Product",
  path: "/v1/extract-product",
  key: "product",
};

#[instrument(
  name = "transformers::product::fetch_product",
  skip(meta, document),
  fields(outcome = Empty),
  err
)]
pub async fn fetch_product(
  meta: &Meta,
  mut document: Document,
) -> Result<Document, TransformerError> {
  if !meta.options.formats.contains(FormatKind::Product) {
    return Ok(document);
  }
  let span = Span::current();
  let Some(base_url) = PRODUCT_EXTRACTION_SERVICE_URL.as_deref() else {
    span.record("outcome", "not_configured");
    document.prepend_warning("Product format is not available (service not configured).");
    return Ok(document);
  };
  let Some(html) = document.raw_html.as_deref() else {
    return Err(TransformerError::CalledOutOfOrder(
      "raw_html is None".to_string(),
    ));
  };

  let request = ExtractionRequest {
    html,
    url: document.metadata.url.as_str(),
    title: None,
  };
  match PRODUCT_SEARCH.extract(base_url, &request).await? {
    Some(product) => {
      span.record("outcome", "found");
      document.product = Some(product);
    }
    None => {
      span.record("outcome", "not_found");
      document
        .prepend_warning("No product found on this page; it does not appear to be a product page.");
    }
  }
  Ok(document)
}
