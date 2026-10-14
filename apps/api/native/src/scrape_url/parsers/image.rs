//! Raster images, OCR'd through FirePDF as one-page scanned documents.

use tracing::field::Empty;

use super::{
  super::{
    document::Document,
    error::ScrapeURLError,
    formats::FormatKind,
    meta::Meta,
    raw_page::{RawPageContent, RawPageResult},
  },
  ParserKind, media_type, pdf,
};

/// Images reach fire-pdf inline only, so above this the POST is a guaranteed 413.
const IMAGE_MAX_FILE_SIZE: usize = pdf::FIRE_PDF_INLINE_HARD_MAX_FILE_SIZE;

/// A content type and the `(offset, bytes)` parts its magic bytes must all match.
type Signature = (&'static str, &'static [(usize, &'static [u8])]);

/// The formats FirePDF opens. SVG and HEIC are absent on purpose: FirePDF cannot open them.
const SIGNATURES: [Signature; 11] = [
  ("image/png", &[(0, b"\x89PNG\r\n\x1a\n")]),
  ("image/jpeg", &[(0, b"\xff\xd8\xff")]),
  ("image/gif", &[(0, b"GIF8")]),
  ("image/tiff", &[(0, b"II*\x00")]),
  ("image/tiff", &[(0, b"MM\x00*")]),
  ("image/bmp", &[(0, b"BM")]),
  ("image/jp2", &[(0, b"\x00\x00\x00\x0cjP  \r\n\x87\n")]),
  ("image/jp2", &[(0, b"\xff\x4f\xff\x51")]),
  ("image/webp", &[(0, b"RIFF"), (8, b"WEBP")]),
  ("image/avif", &[(4, b"ftypavif")]),
  ("image/avif", &[(4, b"ftypavis")]),
];

/// The canonical content type of a supported raster image, from its magic bytes.
fn sniff_image(bytes: &[u8]) -> Option<&'static str> {
  SIGNATURES
    .iter()
    .find(|(_, parts)| {
      parts
        .iter()
        .all(|(at, magic)| bytes.get(*at..at + magic.len()) == Some(*magic))
    })
    .map(|(content_type, _)| *content_type)
}

/// Whether this scrape may OCR raster images: the request's parsers include `image`
/// (the default) and the deployment has image OCR on.
pub fn image_ocr_enabled(meta: &Meta) -> bool {
  meta.options.parsers.contains(ParserKind::Image) && pdf::image_ocr_configured()
}

/// The sniffed content type when the page is a raster image. The header must claim an
/// image or opaque bytes and the bytes must confirm it, so an HTML error page served as
/// `image/jpeg` is never OCR'd. rawBase64 requests keep the bytes instead.
pub fn image_signal(meta: &Meta, result: &RawPageResult) -> Option<&'static str> {
  let RawPageContent::Bytes(bytes) = &result.content else {
    return None;
  };
  let media_type = media_type(&result.content_type);
  if !(media_type.starts_with("image/") || media_type == "application/octet-stream")
    || meta.options.formats.contains(FormatKind::RawBase64)
  {
    return None;
  }
  sniff_image(bytes)
}

/// OCRs an image `image_signal` admitted; `content_type` is its sniffed type.
#[tracing::instrument(
  name = "parsers::image::parse_image",
  skip(meta, result),
  fields(image.file_size_bytes = Empty),
  err
)]
pub async fn parse_image(
  meta: &Meta,
  result: RawPageResult,
  content_type: &'static str,
) -> Result<Document, ScrapeURLError> {
  if let RawPageContent::Bytes(bytes) = &result.content {
    tracing::Span::current().record("image.file_size_bytes", bytes.len());
    if bytes.len() > IMAGE_MAX_FILE_SIZE {
      return Err(ScrapeURLError::UnsupportedFileError {
        reason: "File exceeds size limit".to_string(),
      });
    }
  }
  pdf::ocr_image(meta, result, content_type).await
}
