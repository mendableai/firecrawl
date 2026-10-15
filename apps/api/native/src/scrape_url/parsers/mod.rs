use super::{
  document::Document,
  error::ScrapeURLError,
  formats::FormatKind,
  kinded::{KindedSet, kinded},
  meta::Meta,
  raw_page::{RawPageContent, RawPageResult},
};

pub use self::pdf::{FirePdfError, PdfPage, PdfPageBlocks, fire_engine_pdf_max_size};

mod document;
mod fallback;
mod pdf;
#[cfg(test)]
mod properties;

#[kinded(noun = "parser", default = [Pdf, Image])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Parser {
  Pdf(pdf::PdfOptions),
  Image,
}

pub type Parsers = KindedSet<Parser>;

/// TS `specialtyScrapeCheck`'s last step: binary types no parser opens.
const UNSUPPORTED_BINARY_PREFIXES: [&str; 12] = [
  "image/",
  "video/",
  "audio/",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-tar",
  "application/x-rar",
  "application/x-7z",
  "application/wasm",
  "application/x-executable",
  "application/x-sharedlib",
  "application/java-archive",
];

/// The lowercased media type of a `Content-Type` value, without parameters.
fn media_type(content_type: &str) -> String {
  content_type
    .split_once(';')
    .map_or(content_type, |(x, _)| x)
    .trim()
    .to_lowercase()
}

/// An engine page no parser claimed whose type no parser opens. rawBase64 requests
/// keep the bytes, as TS skips the check for them.
fn is_unsupported_binary(meta: &Meta, result: &RawPageResult) -> bool {
  matches!(
    result.content,
    RawPageContent::Bytes(_) | RawPageContent::ChromeRenderedDOM(_)
  ) && !meta.options.formats.contains(FormatKind::RawBase64)
    && UNSUPPORTED_BINARY_PREFIXES
      .iter()
      .any(|x| media_type(&result.content_type).starts_with(x))
}

#[tracing::instrument(
  name = "parsers::parse_engine_result",
  skip(meta, result),
  fields(
    parser = tracing::field::Empty,
    parser.signal = tracing::field::Empty,
    raw_base64.length = tracing::field::Empty,
  ),
  err
)]
pub async fn parse_engine_result(
  meta: &Meta,
  result: RawPageResult,
) -> Result<Document, ScrapeURLError> {
  let span = tracing::Span::current();
  let document = if let Some(signal) = pdf::pdf_signal(&result) {
    span.record("parser", "pdf");
    span.record("parser.signal", signal);
    pdf::parse_pdf(meta, result, meta.deadline).await
  } else if let Some(signal) = document::document_signal(&result) {
    span.record("parser", "document");
    span.record("parser.signal", signal);
    document::parse_document(meta, result)
  } else if is_unsupported_binary(meta, &result) {
    span.record("parser", "unsupported");
    return Err(ScrapeURLError::UnsupportedFileError {
      reason: result.content_type,
    });
  } else {
    span.record("parser", "fallback");
    fallback::parse_fallback(meta, result)
  }?;
  span.record(
    "raw_base64.length",
    document.raw_base64.as_ref().map(String::len),
  );
  Ok(document)
}
