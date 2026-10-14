use hegel::{TestCase, generators as gs};

use std::sync::Mutex;

use super::super::{
  options::ProxyMode,
  parsers::FirePdfError,
  timeout::{LargePdfProcessing, ServerEstimate, scrape_timeout_error},
  transformers::TransformerError,
};
use super::{ScrapeErrorPayload, ScrapeURLError};

const ENGINES: &[&str] = &["fire-engine", "playwright", "fetch", "index", ""];
const FEATURES: &[&str] = &[
  "actions",
  "parsing an offloaded page",
  "screenshot@fullScreen",
];
const ARGUMENTS: &[&str] = &["options", "internalOptions"];
/// Epoch milliseconds stay below 2^41 until the year 2039.
const CLOCK_MS: i64 = 1 << 41;

/// A FirePDF job still running when the scrape times out; the estimate is fire-pdf's.
#[hegel::composite]
fn large_pdf_processing(tc: &TestCase) -> LargePdfProcessing {
  let clock = || gs::integers::<i64>().min_value(0).max_value(CLOCK_MS);
  LargePdfProcessing {
    job_scrape_id: tc.draw(gs::text().max_size(16)),
    pages_estimate: tc.draw(gs::integers()),
    submitted_at_ms: tc.draw(clock()),
    job_deadline_at_ms: tc.draw(gs::optional(clock())),
    last_status: tc.draw(gs::sampled_from(&["queued", "published", "running"])),
    server_estimate: tc
      .draw(gs::optional(gs::tuples!(gs::integers::<i64>(), clock())))
      .map(|(remaining_ms, observed_at_ms)| ServerEstimate {
        remaining_ms,
        observed_at_ms,
      }),
  }
}

#[hegel::composite]
fn scrape_error(tc: &TestCase) -> ScrapeURLError {
  let text = || gs::text().max_size(48);
  let engine = || gs::sampled_from(ENGINES);
  match tc.draw(gs::integers::<u8>().max_value(37)) {
    0 => ScrapeURLError::CrawlDenialError {
      reason: tc.draw(text()),
    },
    1 => ScrapeURLError::LockdownMissError,
    2 => ScrapeURLError::AgentIndexOnlyError,
    3 => ScrapeURLError::PDFOCRRequiredError(tc.draw(gs::sampled_from(&[
      pdf_inspector::PdfType::TextBased,
      pdf_inspector::PdfType::Scanned,
      pdf_inspector::PdfType::ImageBased,
      pdf_inspector::PdfType::Mixed,
    ]))),
    4 => ScrapeURLError::PDFInsufficientTimeError {
      page_count: tc.draw(gs::integers()),
      min_timeout: tc.draw(gs::integers()),
    },
    5 => ScrapeURLError::SiteError {
      code: tc.draw(text()),
    },
    6 => ScrapeURLError::SSLError {
      skip_tls_verification: tc.draw(gs::booleans()),
    },
    7 => ScrapeURLError::DNSResolutionError {
      hostname: tc.draw(text()),
    },
    8 => ScrapeURLError::UnsupportedFileError {
      reason: tc.draw(text()),
    },
    9 => ScrapeURLError::ActionError {
      error: tc.draw(text()),
    },
    10 => ScrapeURLError::ProxySelectionError,
    11 => ScrapeURLError::ReliableRetrievalError(tc.draw(gs::sampled_from(&[
      ProxyMode::Basic,
      ProxyMode::Enhanced,
      ProxyMode::Auto,
    ]))),
    12 => ScrapeURLError::InsecureConnectionError,
    13 => ScrapeURLError::InvalidURLError,
    14 => ScrapeURLError::PDFFetchFailed,
    15 => ScrapeURLError::PageLoadFailed,
    16 => ScrapeURLError::UnclassifiedEngineError {
      engine: tc.draw(engine()),
      error: tc.draw(text()),
    },
    17 => ScrapeURLError::EngineUnavailable {
      engine: tc.draw(engine()),
      status: tc.draw(gs::integers()),
    },
    18 => ScrapeURLError::NoEnginesLeftError {
      fallback_list: tc.draw(gs::vecs(engine()).max_size(4)),
    },
    19 => ScrapeURLError::ActionsNotSupportedError,
    20 => ScrapeURLError::NotSupported(tc.draw(gs::sampled_from(FEATURES))),
    21 => ScrapeURLError::InvalidInput {
      argument: tc.draw(gs::sampled_from(ARGUMENTS)),
      error: tc.draw(text()),
    },
    22 => ScrapeURLError::Panic(tc.draw(text())),
    23 => ScrapeURLError::Internal(tc.draw(text())),
    24 => ScrapeURLError::Json(
      serde_json::from_str::<serde_json::Value>(&format!("{}{{", tc.draw(text()))).unwrap_err(),
    ),
    25 => ScrapeURLError::Io(std::io::Error::other(tc.draw(text()))),
    26 => ScrapeURLError::UrlParse(tc.draw(gs::sampled_from(&[
      url::ParseError::EmptyHost,
      url::ParseError::InvalidPort,
      url::ParseError::RelativeUrlWithoutBase,
    ]))),
    27 => ScrapeURLError::Base64(base64::DecodeError::InvalidByte(
      tc.draw(gs::integers()),
      tc.draw(gs::integers()),
    )),
    28 => ScrapeURLError::Sqlx(sqlx::Error::Protocol(tc.draw(text()))),
    29 => ScrapeURLError::Transformer(TransformerError::CalledOutOfOrder(tc.draw(text()))),
    30 => ScrapeURLError::Transformer(TransformerError::HtmlProcessing(tc.draw(text()))),
    31 => ScrapeURLError::Transformer(TransformerError::JsonContentTooLarge),
    32 => ScrapeURLError::FirePDF(FirePdfError::Transport(tc.draw(text()))),
    33 => ScrapeURLError::FirePDF(FirePdfError::Status(tc.draw(gs::integers()))),
    34 => ScrapeURLError::FirePDF(FirePdfError::InlineCeiling(tc.draw(gs::integers()))),
    35 => ScrapeURLError::InvalidHeaderValue(
      wreq::header::HeaderValue::from_str(&format!("\n{}", tc.draw(text()))).unwrap_err(),
    ),
    36 => scrape_timeout_error(
      tc.draw(gs::booleans()),
      &Mutex::new(tc.draw(gs::optional(large_pdf_processing()))),
    ),
    _ => ScrapeURLError::Redis(redis::RedisError::from((
      redis::ErrorKind::Io,
      "redis",
      tc.draw(text()),
    ))),
  }
}

#[hegel::test]
fn transport_string_round_trips(tc: TestCase) {
  let error = tc.draw(scrape_error());
  let transport = error.to_transport_string();
  assert_eq!(
    ScrapeErrorPayload::from_transport_string(&transport),
    Some(error.payload()),
    "{transport}"
  );
}
