use std::io::Write;

use bytes::Bytes;
use hegel::generators as gs;
use hegel::{TestCase, one_of};
use url::Url;

use super::super::{
  formats::Format,
  meta::Meta,
  options::{InternalOptions, ScrapeOptions},
  parsers::{Parser, Parsers, pdf::PdfOptions},
  raw_page::{RawPageContent, RawPageResult, ScrapeProxy},
};
use super::{
  document::parse_document, fallback::parse_fallback, parse_engine_result, pdf::parse_pdf,
};

#[hegel::composite]
fn content_type_gen(tc: &TestCase) -> String {
  tc.draw(one_of!(
    gs::sampled_from(vec![
      "text/html".to_string(),
      "text/html; charset=utf-8".to_string(),
      "text/html; charset=shift_jis".to_string(),
      "text/html; charset=windows-1252".to_string(),
      "text/html; charset=gb18030".to_string(),
      "text/html; charset=iso-2022-jp".to_string(),
      "text/html; charset=unknown-charset-xyz".to_string(),
      "text/plain".to_string(),
      "application/json".to_string(),
      "application/pdf".to_string(),
      "application/x-pdf".to_string(),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document".to_string(),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".to_string(),
      "application/vnd.ms-excel".to_string(),
      "application/msword".to_string(),
      "application/rtf".to_string(),
      "text/rtf".to_string(),
      "application/vnd.oasis.opendocument.text".to_string(),
      "application/octet-stream".to_string(),
      "".to_string(),
    ]),
    gs::text().max_size(48)
  ))
}

#[hegel::composite]
fn filename_gen(tc: &TestCase) -> Option<String> {
  tc.draw(gs::optional(one_of!(
    gs::sampled_from(vec![
      "file.pdf".to_string(),
      "file.docx".to_string(),
      "file.doc".to_string(),
      "file.odt".to_string(),
      "file.rtf".to_string(),
      "file.xlsx".to_string(),
      "file.xls".to_string(),
      "file.csv".to_string(),
      "file.epub".to_string(),
      "file.html".to_string(),
      ".docx".to_string(),
      ".doc".to_string(),
      ".odt".to_string(),
      ".rtf".to_string(),
      ".xlsx".to_string(),
      ".xls".to_string(),
      ".csv".to_string(),
      ".epub".to_string(),
      ".ppt".to_string(),
      ".pptx".to_string(),
      "".to_string(),
    ]),
    gs::text().max_size(24)
  )))
}

#[hegel::composite]
fn payload_bytes(tc: &TestCase) -> Bytes {
  let kind = tc.draw(gs::integers::<u8>().min_value(0).max_value(7));
  let raw = match kind {
    0 => tc.draw(gs::binary().max_size(512)),
    1 => {
      let mut v = b"%PDF-1.4\n".to_vec();
      v.extend(tc.draw(gs::binary().max_size(512)));
      v
    }
    2 => {
      let body = tc.draw(gs::text().max_size(120));
      format!(
        "%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj\n4 0 obj << /Length {} >> stream\nBT /F1 12 Tf ({body}) Tj ET\nendstream endobj\nxref\n0 5\ntrailer << /Root 1 0 R /Size 5 >>\n%%EOF",
        body.len() + 22
      )
      .into_bytes()
    }
    3 => {
      let mut v = vec![0x50, 0x4b, 0x03, 0x04];
      v.extend(tc.draw(gs::binary().max_size(512)));
      v
    }
    4 => {
      let mut v = vec![0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
      v.extend(tc.draw(gs::binary().max_size(512)));
      v
    }
    5 => {
      let mut v = b"{\\rtf1\\ansi ".to_vec();
      v.extend(tc.draw(gs::binary().max_size(256)));
      v.push(b'}');
      v
    }
    6 => {
      let entry_name = tc.draw(one_of!(
        gs::sampled_from(vec![
          "word/document.xml".to_string(),
          "content.xml".to_string(),
          "xl/workbook.xml".to_string(),
          "xl/sharedStrings.xml".to_string(),
          "_rels/.rels".to_string(),
          "word/_rels/document.xml.rels".to_string(),
        ]),
        gs::text().max_size(24)
      ));
      let xml = tc.draw(gs::binary().max_size(256));
      let mut buf = Vec::new();
      {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
        let opts = zip::write::SimpleFileOptions::default()
          .compression_method(zip::CompressionMethod::Stored);
        if zip.start_file(&entry_name, opts).is_ok() {
          let _ = zip.write_all(&xml);
        }
        let _ = zip.finish();
      }
      buf
    }
    _ => {
      let charset = tc.draw(one_of!(
        gs::sampled_from(vec![
          "utf-8".to_string(), "shift_jis".to_string(), "euc-jp".to_string(),
          "gbk".to_string(), "windows-1251".to_string(), "invalid-charset".to_string(),
        ]),
        gs::text().max_size(16)
      ));
      let mut v = format!("<html><head><meta charset=\"{charset}\"></head><body>").into_bytes();
      v.extend(tc.draw(gs::binary().max_size(256)));
      v.extend_from_slice(b"</body></html>");
      v
    }
  };
  Bytes::from(raw)
}

#[hegel::composite]
fn raw_page_parts(
  tc: &TestCase,
) -> (Bytes, String, Option<String>, bool, bool, Option<u32>) {
  (
    tc.draw(payload_bytes()),
    tc.draw(content_type_gen()),
    tc.draw(filename_gen()),
    tc.draw(gs::booleans()),
    tc.draw(gs::booleans()),
    tc.draw(gs::optional(gs::integers::<u32>().min_value(0).max_value(10))),
  )
}

#[hegel::test]
fn parse_fallback_never_panics(tc: TestCase) {
  let (bytes, content_type, filename, raw_base64, _, _) = tc.draw(raw_page_parts());
  let mut options = ScrapeOptions::default();
  if raw_base64 {
    options.formats = [Format::Markdown, Format::RawBase64].into_iter().collect();
  }
  let url = Url::parse("https://example.com/file").expect("valid static URL");
  let meta = Meta::new(
    "test-scrape-id".to_string(),
    url.clone(),
    "test-team".to_string(),
    options,
    InternalOptions::default(),
  );
  let _ = parse_fallback(
    &meta,
    RawPageResult {
      url,
      status_code: 200,
      content: RawPageContent::Bytes(bytes),
      screenshot: None,
      actions: None,
      cached_at: None,
      content_type,
      audio_cookies: Vec::new(),
      proxy_used: ScrapeProxy::Basic,
      timezone: None,
      filename,
    },
  );
}

#[hegel::test]
fn parse_document_never_panics(tc: TestCase) {
  let (bytes, content_type, filename, raw_base64, _, _) = tc.draw(raw_page_parts());
  let _ = crate::convert_document_to_markdown(bytes.as_ref(), filename.clone());
  let mut options = ScrapeOptions::default();
  if raw_base64 {
    options.formats = [Format::Markdown, Format::RawBase64].into_iter().collect();
  }
  let url = Url::parse("https://example.com/file").expect("valid static URL");
  let meta = Meta::new(
    "test-scrape-id".to_string(),
    url.clone(),
    "test-team".to_string(),
    options,
    InternalOptions::default(),
  );
  let _ = parse_document(
    &meta,
    RawPageResult {
      url,
      status_code: 200,
      content: RawPageContent::Bytes(bytes),
      screenshot: None,
      actions: None,
      cached_at: None,
      content_type,
      audio_cookies: Vec::new(),
      proxy_used: ScrapeProxy::Basic,
      timezone: None,
      filename,
    },
  );
}

#[hegel::test]
fn parse_pdf_and_engine_result_never_panic(tc: TestCase) {
  let (b1, ct1, fn1, raw_base64, pdf_enabled, max_pages) = tc.draw(raw_page_parts());
  let (b2, ct2, fn2, _, _, _) = tc.draw(raw_page_parts());
  let mut options = ScrapeOptions::default();
  if raw_base64 {
    options.formats = [Format::Markdown, Format::RawBase64].into_iter().collect();
  }
  options.parsers = if pdf_enabled {
    [Parser::Pdf(PdfOptions {
      max_pages,
      ..PdfOptions::default()
    })]
    .into_iter()
    .collect()
  } else {
    Parsers::new()
  };
  let url = Url::parse("https://example.com/file").expect("valid static URL");
  let meta = Meta::new(
    "test-scrape-id".to_string(),
    url.clone(),
    "test-team".to_string(),
    options,
    InternalOptions::default(),
  );

  let rt = tokio::runtime::Builder::new_current_thread()
    .enable_all()
    .build()
    .expect("tokio runtime");

  let _ = rt.block_on(parse_pdf(
    &meta,
    RawPageResult {
      url: url.clone(),
      status_code: 200,
      content: RawPageContent::Bytes(b1),
      screenshot: None,
      actions: None,
      cached_at: None,
      content_type: ct1,
      audio_cookies: Vec::new(),
      proxy_used: ScrapeProxy::Basic,
      timezone: None,
      filename: fn1,
    },
    None,
  ));
  let _ = rt.block_on(parse_engine_result(
    &meta,
    RawPageResult {
      url,
      status_code: 200,
      content: RawPageContent::Bytes(b2),
      screenshot: None,
      actions: None,
      cached_at: None,
      content_type: ct2,
      audio_cookies: Vec::new(),
      proxy_used: ScrapeProxy::Basic,
      timezone: None,
      filename: fn2,
    },
  ));
}
