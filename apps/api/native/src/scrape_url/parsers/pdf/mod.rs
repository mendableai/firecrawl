use tokio::time::Instant;
use tracing::{Span, field::Empty};

use self::{
  detect::{
    pdf_binary_match, pdf_content_type_match, pdf_file_extension_match, pdf_signature_match,
  },
  firepdf::{FirePdfClient, FirePdfConfig, FirePdfJobOptions, FirePdfRequest, SourceKind, now_ms},
  inline::fire_pdf_image,
  limits::ensure_ocr_time,
  local::{run_local_pass, text_fallback},
  ocr::{OcrInput, ensure_configured, run_ocr},
  output::{PageInfo, PdfFacts, image_document, indexed_document, parsed_document, raw_document},
  source::{PdfSource, load_pdf},
  types::PdfMode,
};
use super::super::{
  document::Document,
  error::ScrapeURLError,
  meta::Meta,
  raw_page::{RawPageContent, RawPageResult},
};

mod detect;
mod firepdf;
mod html;
mod inline;
mod inspector;
mod limits;
mod local;
mod ocr;
mod output;
mod source;
mod types;

pub use self::{
  firepdf::FirePdfError,
  limits::{FIRE_PDF_INLINE_HARD_MAX_FILE_SIZE, fire_engine_pdf_max_size},
  types::{PdfOptions, PdfPage, PdfPageBlocks},
};

/// Why a page goes to the PDF parser, or `None` if nothing says it is a PDF.
pub fn pdf_signal(result: &RawPageResult) -> Option<&'static str> {
  if pdf_content_type_match(&result.content_type) {
    return Some("content_type");
  }
  match &result.content {
    // fire-engine only hands off verified PDFs.
    RawPageContent::BytesOffloaded(_) => return Some("offloaded"),
    RawPageContent::Bytes(bytes) if pdf_signature_match(bytes) => return Some("bytes"),
    _ => {}
  }
  result
    .filename
    .as_deref()
    .is_some_and(pdf_file_extension_match)
    .then_some("filename")
}

/// The scrape deadline on the epoch-millisecond clock fire-pdf's deadline contract uses.
fn deadline_epoch_ms(deadline: Instant) -> i64 {
  let remaining = deadline
    .saturating_duration_since(Instant::now())
    .as_millis();
  now_ms().saturating_add(i64::try_from(remaining).unwrap_or(i64::MAX))
}

/// Parses a PDF: pdf-inspector serves the text PDFs it handles confidently, FirePDF
/// handles the rest, and text extraction is the last resort. `deadline` is the
/// scrape deadline; it sizes fire-pdf's budgets and the insufficient-time check.
#[tracing::instrument(
  name = "parsers::pdf::parse_pdf",
  skip_all,
  fields(
    pdf.file_size_bytes = Empty,
    pdf.handed_off = Empty,
    pdf.engine = Empty,
    pdf.num_pages = Empty,
    pdf.total_pages = Empty,
  ),
  err
)]
pub async fn parse_pdf(
  meta: &Meta,
  result: RawPageResult,
  deadline: Option<Instant>,
) -> Result<Document, ScrapeURLError> {
  let span = Span::current();
  let config = FirePdfConfig::get();
  let deadline_ms = deadline.map(deadline_epoch_ms);
  let (page, content) = PageInfo::split(result);

  let (bytes, handoff) = match load_pdf(config, meta, content).await? {
    PdfSource::Bytes { bytes, handoff } => (bytes, handoff),
    PdfSource::Indexed { html, pdf_metadata } => {
      span.record("pdf.engine", "index");
      return Ok(indexed_document(meta, page, html, pdf_metadata));
    }
  };
  span.record("pdf.file_size_bytes", bytes.len());
  span.record("pdf.handed_off", handoff.is_some());

  let Some(parser) = meta.options.parsers.pdf() else {
    span.record("pdf.engine", "raw");
    return raw_document(meta, page, &bytes);
  };
  ensure_configured(config, parser)?;
  if !pdf_binary_match(&bytes) {
    return Err(ScrapeURLError::PDFFetchFailed);
  }

  let force_requested = meta.options.__force_fire_pdf || parser.page_aware();
  let force_fire_pdf = force_requested && config.base_url.is_some();
  let mut local = run_local_pass(&bytes, parser, force_fire_pdf).await?;
  let mut engine = "pdf-inspector";

  if local.parsed.is_none() {
    ensure_ocr_time(local.effective_page_count, deadline_ms, now_ms())?;
    let input = OcrInput {
      bytes: &bytes,
      handoff: handoff.as_ref(),
      parser,
      force_requested,
      force_fire_pdf,
      pages_estimate: local.effective_page_count,
      deadline_ms,
    };
    if let Some(result) = run_ocr(config, meta, input).await? {
      engine = "fire-pdf";
      // Never shrink a count the local pass established; fire-pdf may have been capped.
      local.effective_page_count = local.effective_page_count.max(result.pages_processed);
      local.parsed = Some(result.into());
    }
  }

  let facts = PdfFacts {
    num_pages: Some(local.effective_page_count),
    total_pages: local.total_page_count,
    title: local.title.take(),
  };
  let parsed = match local.parsed.take() {
    Some(parsed) => parsed,
    None => {
      engine = "text-fallback";
      text_fallback(&bytes, parser, local, force_fire_pdf).await
    }
  };
  span.record("pdf.engine", engine);
  span.record("pdf.num_pages", facts.num_pages);
  span.record("pdf.total_pages", facts.total_pages);
  Ok(parsed_document(meta, page, parser, parsed, &bytes, facts))
}

/// Whether the deployment OCRs raster images: FirePDF is configured and `IMAGE_OCR_ENABLED` is on.
pub fn image_ocr_configured() -> bool {
  let config = FirePdfConfig::get();
  config.base_url.is_some() && config.image_ocr_enabled
}

/// OCRs a raster image as a one-page scanned document. The pdf parser's options do not
/// apply, as an image has no text layer; only its `refresh` reaches the content cache.
pub async fn ocr_image(
  meta: &Meta,
  result: RawPageResult,
  content_type: &str,
) -> Result<Document, ScrapeURLError> {
  let (page, content) = PageInfo::split(result);
  let RawPageContent::Bytes(bytes) = content else {
    return Err(ScrapeURLError::NotSupported(
      "OCRing a page that is not a file",
    ));
  };
  let mut request = FirePdfRequest::from_meta(meta, meta.deadline.map(deadline_epoch_ms));
  request.source_kind = SourceKind::Image;
  let client = FirePdfClient::new(FirePdfConfig::get(), &request).ok_or(FirePdfError::Contract(
    "Image OCR is unavailable because FirePDF is not configured",
  ))?;
  let options = FirePdfJobOptions {
    max_pages: None,
    pages_estimate: 1,
    mode: PdfMode::Ocr,
    page_markdown: false,
    blocks: false,
    page_markers: false,
    refresh: meta.options.parsers.pdf().is_some_and(|x| x.refresh),
  };
  match fire_pdf_image(&client, &bytes, &options).await {
    Ok(ocr) => Ok(image_document(meta, page, content_type, ocr.into())),
    Err(FirePdfError::Unopenable) => Err(ScrapeURLError::UnsupportedFileError {
      reason: content_type.to_string(),
    }),
    Err(error) => Err(error.into()),
  }
}
