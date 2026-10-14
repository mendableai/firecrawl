use std::collections::HashMap;

use base64::Engine;

use super::{
  super::{
    document::{Document, DocumentMetadata, DocumentMetadataCacheState},
    error::ScrapeURLError,
    formats::FormatKind,
    meta::Meta,
    raw_page::{RawPageContent, RawPageResult},
  },
  media_type,
};

/// TS `DOCUMENT_CONTENT_TYPE_TO_EXTENSION`.
const DOCUMENT_CONTENT_TYPE_TO_EXTENSION: [(&str, &str); 17] = [
  (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "docx",
  ),
  ("application/vnd.ms-word.document.macroenabled.12", "docm"),
  ("application/msword", "doc"),
  (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xlsx",
  ),
  ("application/vnd.ms-excel", "xls"),
  ("application/vnd.ms-excel.sheet.macroenabled.12", "xlsm"),
  (
    "application/vnd.ms-excel.sheet.binary.macroenabled.12",
    "xlsb",
  ),
  (
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "pptx",
  ),
  ("application/vnd.ms-powerpoint", "ppt"),
  (
    "application/vnd.ms-powerpoint.presentation.macroenabled.12",
    "pptm",
  ),
  ("application/vnd.oasis.opendocument.text", "odt"),
  ("application/vnd.oasis.opendocument.spreadsheet", "ods"),
  ("application/vnd.oasis.opendocument.presentation", "odp"),
  ("application/rtf", "rtf"),
  ("text/rtf", "rtf"),
  ("application/epub+zip", "epub"),
  ("text/csv", "csv"),
];

fn document_extension_from_content_type(content_type: &str) -> Option<&'static str> {
  let media_type = media_type(content_type);
  DOCUMENT_CONTENT_TYPE_TO_EXTENSION
    .iter()
    .find(|(x, _)| *x == media_type)
    .map(|(_, extension)| *extension)
}

/// A ZIP signature under these is a real archive, not a mislabeled Office file.
const ZIP_ARCHIVE_MEDIA_TYPES: [&str; 3] = [
  "application/zip",
  "application/x-zip-compressed",
  "application/java-archive",
];

/// The local file header every OOXML/ODF container starts with.
const ZIP_SIGNATURE: &[u8] = b"PK\x03\x04";

/// The OLE2/CFB header of legacy Office files (.doc, .xls, .ppt).
const OLE2_SIGNATURE: &[u8] = &[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

fn document_file_extension_match(filename: &str) -> bool {
  filename.ends_with(".docx")
    || filename.ends_with(".doc")
    || filename.ends_with(".odt")
    || filename.ends_with(".rtf")
    || filename.ends_with(".xlsx")
    || filename.ends_with(".xls")
}

/// Why a page goes to the document parser, or `None` if nothing says it is a document.
pub fn document_signal(result: &RawPageResult) -> Option<&'static str> {
  if document_extension_from_content_type(&result.content_type).is_some() {
    return Some("content_type");
  }
  let media_type = media_type(&result.content_type);
  if let RawPageContent::Bytes(bytes) = &result.content
    && (bytes.starts_with(OLE2_SIGNATURE)
      || (bytes.starts_with(ZIP_SIGNATURE)
        && !ZIP_ARCHIVE_MEDIA_TYPES.contains(&media_type.as_str())))
  {
    return Some("bytes");
  }
  result
    .filename
    .as_deref()
    .is_some_and(document_file_extension_match)
    .then_some("filename")
}

#[tracing::instrument(name = "parsers::document::parse_document", skip_all, err)]
pub fn parse_document(meta: &Meta, result: RawPageResult) -> Result<Document, ScrapeURLError> {
  match result.content {
    RawPageContent::Bytes(bytes) => {
      let format = anydoc::Format::from_bytes(bytes.as_ref()).or_else(|| {
        result
          .filename
          .as_deref()
          .map(|ext| ext.trim_start_matches('.'))
          .and_then(anydoc::Format::from_extension)
          .or_else(|| {
            document_extension_from_content_type(&result.content_type)
              .and_then(anydoc::Format::from_extension)
          })
      });

      let markdown = anydoc::to_markdown_bytes(bytes.as_ref(), format).map_err(|e| {
        ScrapeURLError::UnsupportedFileError {
          reason: format!("failed to convert document: {e}"),
        }
      })?;
      let html = markdown::to_html_with_options(&markdown, &markdown::Options::gfm())
        .map_err(|e| ScrapeURLError::Internal(e.to_string()))?;

      Ok(Document {
        markdown: Some(markdown),
        html: None,
        raw_html: Some(html),
        raw_base64: meta
          .options
          .formats
          .contains(FormatKind::RawBase64)
          .then(|| base64::engine::general_purpose::STANDARD.encode(bytes.as_ref())),
        links: None,
        images: None,
        screenshot: result.screenshot,
        audio: None,
        video: None,
        extract: None,
        json: None,
        summary: None,
        answer: None,
        highlights: None,
        attributes: None,
        actions: result.actions,
        pages: None,
        blocks: None,
        warning: None,
        metadata: DocumentMetadata {
          scrape_id: meta.id.clone(),
          source_url: meta.source_url(),
          url: result.url,
          status_code: result.status_code,
          num_pages: None, // TODO: should we set this in document? on prod we don't. will this mess with billing?
          title: None,     // TODO: ^
          content_type: result.content_type,
          timezone: result.timezone,
          proxy_used: result.proxy_used,
          cache_state: DocumentMetadataCacheState::Miss, // TODO:
          cached_at: None,                               // TODO:
          index_id: None,                                // TODO:
          credits_used: None,                            // TODO:
          concurrency_limited: false,                    // TODO:
          concurrency_queue_duration_ms: None,           // TODO:
          postprocessors_used: None,
          total_pages: None,
          extra: HashMap::new(),
        },
      })
    }
    RawPageContent::BytesOffloaded(_) => Err(ScrapeURLError::NotSupported(
      "parsing an offloaded document",
    )),
    RawPageContent::IndexFakeHTML(html, _) => {
      Ok(Document {
        markdown: None,
        html: None,
        raw_base64: None,
        raw_html: Some(html),
        links: None,
        images: None,
        screenshot: result.screenshot,
        audio: None,
        video: None,
        extract: None,
        json: None,
        summary: None,
        answer: None,
        highlights: None,
        attributes: None,
        actions: result.actions,
        pages: None,
        blocks: None,
        warning: None,
        metadata: DocumentMetadata {
          scrape_id: meta.id.clone(),
          source_url: meta.source_url(),
          url: result.url,
          status_code: result.status_code,
          num_pages: None, // TODO: should we set this in document? on prod we don't. will this mess with billing?
          title: None,     // TODO: ^
          content_type: result.content_type,
          timezone: result.timezone,
          proxy_used: result.proxy_used,
          cache_state: DocumentMetadataCacheState::Miss, // TODO:
          cached_at: None,                               // TODO:
          index_id: None,                                // TODO:
          credits_used: None,                            // TODO:
          concurrency_limited: false,                    // TODO:
          concurrency_queue_duration_ms: None,           // TODO:
          postprocessors_used: None,
          total_pages: None,
          extra: HashMap::new(),
        },
      })
    }
    RawPageContent::ChromeRenderedDOM(_) | RawPageContent::GeneratedMarkdown(_) => Err(
      ScrapeURLError::NotSupported("parsing a rendered page as a document"),
    ),
  }
}
