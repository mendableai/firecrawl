use super::{
  document::Document,
  error::ScrapeURLError,
  kinded::{KindedSet, kinded},
  meta::Meta,
  raw_page::RawPageResult,
};

pub use self::pdf::{FirePdfError, PdfPage, PdfPageBlocks, fire_engine_pdf_max_size};

mod document;
mod fallback;
mod pdf;

#[kinded(noun = "parser", default = [Pdf, Image])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Parser {
  Pdf(pdf::PdfOptions),
  Image,
}

pub type Parsers = KindedSet<Parser>;

/// Why branding can't run on this page, in TS's words; `None` for web pages.
pub fn branding_unsupported_reason(result: &RawPageResult) -> Option<&'static str> {
  if pdf::has_pdf_signal(result) {
    Some("Branding extraction is only supported for HTML web pages. PDFs are not supported.")
  } else if document::has_document_signal(result) {
    Some(
      "Branding extraction is only supported for HTML web pages. Documents (docx, xlsx, etc.) are not supported.",
    )
  } else {
    None
  }
}

#[tracing::instrument(
  name = "parsers::parse_engine_result",
  skip(meta, result),
  fields(parser = tracing::field::Empty, raw_base64.length = tracing::field::Empty),
  err
)]
pub async fn parse_engine_result(
  meta: &Meta,
  result: RawPageResult,
) -> Result<Document, ScrapeURLError> {
  let document = if pdf::has_pdf_signal(&result) {
    tracing::Span::current().record("parser", "pdf");
    pdf::parse_pdf(meta, result, meta.deadline).await
  } else if document::has_document_signal(&result) {
    tracing::Span::current().record("parser", "document");
    document::parse_document(meta, result)
  } else {
    tracing::Span::current().record("parser", "fallback");
    fallback::parse_fallback(meta, result)
  }?;
  tracing::Span::current().record(
    "raw_base64.length",
    document.raw_base64.as_ref().map(String::len),
  );
  Ok(document)
}
