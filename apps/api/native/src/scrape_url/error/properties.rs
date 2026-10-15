use hegel::{TestCase, generators as gs};

use std::sync::Mutex;

use super::super::{
  cost_tracking::{CostTracking, CostTrackingJson, CostTrackingTokens, calculate_cost},
  options::ProxyMode,
  parsers::FirePdfError,
  timeout::{LargePdfProcessing, ServerEstimate, scrape_timeout_error},
  transformers::TransformerError,
};
use super::{ScrapeFailure, ScrapeURLError};

const ENGINES: &[&str] = &["fire-engine", "playwright", "fetch", "index", ""];
const FEATURES: &[&str] = &[
  "actions",
  "parsing an offloaded page",
  "screenshot@fullScreen",
];
const ARGUMENTS: &[&str] = &["options", "internalOptions"];
const MODELS: &[&str] = &[
  "gpt-4o-mini",
  "gpt-4.1",
  "gpt-5-nano",
  "google/gemini-2.0-flash-001",
  "gemini-2.5-pro",
  "unpriced-model",
];
const CALL_DETAILS: &[&str] = &["generateCompletions", "repairConfig", "summary"];

/// The LLM calls a scrape made before failing, recorded and priced as the transformers do.
#[hegel::composite]
fn cost_tracking(tc: &TestCase) -> CostTrackingJson {
  let tracking = CostTracking::default();
  for _ in 0..tc.draw(gs::integers::<u8>().max_value(4)) {
    let model = tc.draw(gs::sampled_from(MODELS));
    let tokens = CostTrackingTokens {
      input: tc.draw(gs::integers::<u32>()).into(),
      output: tc.draw(gs::integers::<u32>()).into(),
    };
    let metadata = serde_json::json!({
      "module": "scrapeURL",
      "method": tc.draw(gs::text().max_size(16)),
      "gcDetails": tc.draw(gs::sampled_from(CALL_DETAILS)),
    });
    let cost = calculate_cost(model, tokens.input, tokens.output);
    tracking.add_call(metadata, model, cost, tokens);
  }
  tracking.to_json()
}
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

/// The string a rejected `scrapeUrl` carries across napi decodes back to the same failure.
#[hegel::test]
fn transport_string_round_trips(tc: TestCase) {
  let error = tc.draw(scrape_error());
  let cost_tracking = tc.draw(cost_tracking());
  let transport = error.to_failure_transport_string(cost_tracking.clone());
  let failure = ScrapeFailure::from_transport_string(&transport);
  let failure = failure.unwrap_or_else(|| panic!("undecodable: {transport}"));
  assert_eq!(failure.error, error.payload(), "{transport}");
  assert_eq!(
    serde_json::to_value(&failure.cost_tracking).unwrap(),
    serde_json::to_value(&cost_tracking).unwrap(),
    "{transport}"
  );
}
