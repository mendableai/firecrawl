use bytes::Bytes;
use encoding_rs::Encoding;
use hegel::{
  TestCase,
  generators::{self as gs, Generator},
};
use url::Url;

use super::super::{
  error::ScrapeErrorPayload,
  formats::Format,
  meta::Meta,
  options::{InternalOptions, ScrapeOptions},
  raw_page::{RawPageContent, RawPageResult, ScrapeProxy},
};
use super::{Parser, parse_engine_result, pdf::PdfOptions};

mod office;

const PAGE_URL: &str = "https://example.com/file";

const CONTENT_TYPES: &[&str] = &[
  "text/html",
  "text/html; charset=utf-8",
  "text/html; charset=\"gb18030\"",
  "text/html; charset=x-user-defined",
  "text/html; charset=",
  "text/html;charset=utf-16le;charset=latin1",
  "application/pdf",
  "APPLICATION/PDF; name=a.pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/msword",
  "application/rtf",
  "text/rtf",
  "application/vnd.oasis.opendocument.text",
  "application/json",
  "text/plain",
  "application/octet-stream",
  "",
  ";;;",
];

const FILENAMES: &[&str] = &[
  "a.pdf", "a.docx", "a.doc", "a.odt", "a.rtf", "a.xlsx", "a.xls", "a.pptx", "a.html", ".pdf", "",
];

const CHARSETS: &[&str] = &[
  "utf-8",
  "shift_jis",
  "euc-kr",
  "gb18030",
  "big5",
  "iso-8859-1",
  "windows-1252",
  "koi8-r",
  "utf-16le",
  "x-user-defined",
  "replacement",
  "bogus",
];

/// Objects of a one-page PDF; `{n}` and `{text}` are filled in per draw.
const PDF_OBJECTS: &[&str] = &[
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count {n} >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {n} {n}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
  "stream:BT /F1 {n} Tf {n} {n} Td ({text}) Tj ET",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  "<< /Title ({text}) /Author <FEFF00{n}> >>",
];

/// Replacements for any object above, to corrupt the document's structure.
const PDF_MUTATIONS: &[&str] = &[
  "stream:{text}",
  "<< /Length {n} /Filter /FlateDecode >>\nstream\n{text}\nendstream",
  "<< /Type /Font /Subtype /Type0 /Encoding /Identity-H /ToUnicode {n} 0 R >>",
  "<< /Type /XObject /Subtype /Image /Width {n} /Height {n} /BitsPerComponent 8 >>",
  "[{n} 0 R {n} 0 R]",
  "{text}",
];

#[hegel::composite]
fn pdf_object(tc: &TestCase, template: &'static str) -> String {
  let mut object = template.replace("{text}", &tc.draw(gs::text().max_size(32)));
  while object.contains("{n}") {
    let n = tc.draw(hegel::one_of!(
      gs::integers::<i64>().min_value(-2).max_value(1024),
      gs::integers::<i64>(),
    ));
    object = object.replacen("{n}", &n.to_string(), 1);
  }
  match object.strip_prefix("stream:") {
    Some(content) => format!(
      "<< /Length {} >>\nstream\n{content}\nendstream",
      content.len()
    ),
    None => object,
  }
}

#[hegel::composite]
fn pdf_body(tc: &TestCase) -> Vec<u8> {
  let mut pdf = format!("%PDF-1.{}\n", tc.draw(gs::integers::<u8>().max_value(9))).into_bytes();
  let mut offsets = Vec::new();
  for template in PDF_OBJECTS {
    let template = match tc.draw(gs::weighted_booleans(0.15)) {
      true => tc.draw(gs::sampled_from(PDF_MUTATIONS)),
      false => template,
    };
    let object = tc.draw(pdf_object(template));
    offsets.push(pdf.len());
    pdf.extend(format!("{} 0 obj\n{object}\nendobj\n", offsets.len()).bytes());
  }
  let xref = pdf.len();
  pdf.extend(format!("xref\n0 {}\n0000000000 65535 f \n", offsets.len() + 1).bytes());
  for offset in &offsets {
    let offset = match tc.draw(gs::weighted_booleans(0.9)) {
      true => *offset,
      false => tc.draw(gs::integers::<usize>().max_value(99_999)),
    };
    pdf.extend(format!("{offset:010} 00000 n \n").bytes());
  }
  let size = offsets.len() + 1;
  pdf.extend(
    format!("trailer\n<< /Size {size} /Root 1 0 R /Info 6 0 R >>\nstartxref\n{xref}\n%%EOF\n")
      .bytes(),
  );
  if tc.draw(gs::weighted_booleans(0.1)) {
    pdf.truncate(tc.draw(gs::integers::<usize>().max_value(pdf.len())));
  }
  pdf
}

#[hegel::composite]
fn rtf_body(tc: &TestCase) -> Vec<u8> {
  let words = tc.draw(
    gs::vecs(hegel::one_of!(
      gs::sampled_from(&[
        "\\par ",
        "\\b ",
        "\\b0 ",
        "\\u-3913?",
        "\\'e9",
        "{",
        "}",
        "\\*\\generator x;",
        "{\\fonttbl{\\f0 Times;}}",
        "\\bin4 ",
        "\\pict ",
        "\\tab ",
        "\\uc0 ",
      ])
      .map(|x: &str| x.to_string()),
      gs::text().max_size(16),
    ))
    .max_size(12),
  );
  format!("{{\\rtf1\\ansi\\deff0 {}}}", words.concat()).into_bytes()
}

#[hegel::composite]
fn html_body(tc: &TestCase) -> Vec<u8> {
  let charset = tc.draw(gs::sampled_from(CHARSETS));
  let text = tc.draw(gs::text().max_size(64));
  let html =
    format!("<html><head><meta charset=\"{charset}\"></head><body><p>{text}</p></body></html>");
  Encoding::for_label(charset.as_bytes()).map_or_else(
    || html.clone().into_bytes(),
    |x| x.encode(&html).0.into_owned(),
  )
}

#[hegel::composite]
fn body(tc: &TestCase) -> Vec<u8> {
  let magic: &[u8] = match tc.draw(gs::integers::<u8>().max_value(7)) {
    0 => return tc.draw(pdf_body()),
    1 => return tc.draw(office::zip_body()),
    2 => return tc.draw(rtf_body()),
    3 => return tc.draw(html_body()),
    4 => b"PK\x03\x04",
    5 => &[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
    6 => b"%PDF-1.7\n",
    _ => b"",
  };
  [magic, &tc.draw(gs::binary().max_size(512))].concat()
}

#[hegel::composite]
fn pdf_parser(tc: &TestCase) -> PdfOptions {
  serde_json::from_value(serde_json::json!({
    "mode": tc.draw(gs::sampled_from(&["auto", "fast", "ocr"])),
    "maxPages": tc.draw(gs::optional(gs::integers::<u32>().max_value(4))),
    "pages": tc.draw(gs::weighted_booleans(0.1)),
  }))
  .unwrap()
}

#[tokio::test]
#[hegel::test]
async fn parsers_never_panic(tc: TestCase) {
  let content_type = tc.draw(hegel::one_of!(
    gs::sampled_from(CONTENT_TYPES).map(|x: &str| x.to_string()),
    gs::text().max_size(32),
  ));
  let filename = tc
    .draw(gs::optional(gs::sampled_from(FILENAMES)))
    .map(str::to_string);
  let content = tc.draw(body());
  let mut options = ScrapeOptions::default();
  if tc.draw(gs::booleans()) {
    options.formats = [Format::Markdown, Format::RawBase64].into_iter().collect();
  }
  if let Some(pdf) = tc.draw(gs::optional(pdf_parser())) {
    options.parsers = [Parser::Pdf(pdf)].into_iter().collect();
  }
  let url = Url::parse(PAGE_URL).unwrap();
  let meta = Meta::new(
    "p".into(),
    url.clone(),
    "t".into(),
    options,
    InternalOptions::default(),
    Default::default(),
  );
  let result = RawPageResult {
    url,
    status_code: 200,
    content: RawPageContent::Bytes(Bytes::from(content)),
    screenshot: None,
    actions: None,
    cached_at: None,
    content_type,
    audio_cookies: Vec::new(),
    proxy_used: ScrapeProxy::Basic,
    timezone: None,
    postprocessors_used: None,
    filename,
  };

  if let Err(error) = parse_engine_result(&meta, result).await {
    let payload = error.payload();
    assert!(
      !matches!(payload, ScrapeErrorPayload::Panic { .. }),
      "{payload:?}"
    );
  }
}
