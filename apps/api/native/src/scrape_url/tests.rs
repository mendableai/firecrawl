use std::sync::{Arc, Mutex};

use hegel::extras::serde_json as json_gs;
use hegel::generators as gs;
use hegel::{Generator, TestCase, one_of};
use serde_json::{Value, json};
use tracing::field::{Empty, Field, Visit};
use tracing_subscriber::{Layer, layer::Context, prelude::*};

use super::{
  cost_tracking::CostTrackingJson,
  decode_scrape_url_error,
  error::{ScrapeErrorPayload, ScrapeFailure, ScrapeURLError},
  options::{InternalOptions, ProxyMode, ScrapeOptions},
  parse_input,
  timeout::{
    ScrapeTimeoutJobStatus, ScrapeTimeoutProcessing, ScrapeTimeoutProcessingState,
  },
  transformers::TransformerError,
};

#[derive(Default, Clone)]
struct RecordedInputSpan {
  argument: Arc<Mutex<Option<String>>>,
  path: Arc<Mutex<Option<String>>>,
}

impl Visit for RecordedInputSpan {
  fn record_str(&mut self, field: &Field, value: &str) {
    match field.name() {
      "input.argument" => *self.argument.lock().unwrap() = Some(value.to_string()),
      "input.path" => *self.path.lock().unwrap() = Some(value.to_string()),
      _ => {}
    }
  }

  fn record_debug(&mut self, _field: &Field, _value: &dyn std::fmt::Debug) {}
}

impl<S: tracing::Subscriber> Layer<S> for RecordedInputSpan {
  fn on_record(
    &self,
    _id: &tracing::span::Id,
    values: &tracing::span::Record<'_>,
    _ctx: Context<'_, S>,
  ) {
    let mut visitor = self.clone();
    values.record(&mut visitor);
  }
}

#[hegel::composite]
fn options_json_gen(tc: &TestCase) -> Value {
  let mode = tc.draw(gs::integers::<u8>().min_value(0).max_value(2));
  match mode {
    0 => tc.draw(json_gs::values()),
    1 => {
      let formats = tc.draw(one_of!(
        gs::just(json!(["markdown", "html", "links", "images", "rawHtml"])),
        gs::just(json!(["markdown", "markdown"])),
        gs::just(json!([{"type": "screenshot", "fullPage": true, "quality": 80}])),
        gs::just(json!([{"type": "markdown", "extra": 1}])),
        gs::just(json!(["unknownFormat"])),
        json_gs::values()
      ));
      let proxy = tc.draw(one_of!(
        gs::sampled_from(vec![
          json!("auto"),
          json!("basic"),
          json!("stealth"),
          json!("enhanced"),
          json!("invalid-proxy"),
        ]),
        json_gs::values()
      ));
      let country = tc.draw(one_of!(
        gs::sampled_from(vec![
          json!("us-generic"),
          json!("us-whitelist"),
          json!("us"),
          json!("invalid-country"),
        ]),
        json_gs::values()
      ));
      let only_main_content = tc.draw(one_of!(gs::booleans().map(Value::Bool), json_gs::values()));
      let timeout = tc.draw(one_of!(
        gs::just(Value::Null),
        gs::integers::<u64>().map(|n| json!(n)),
        gs::integers::<i64>().max_value(-1).map(|n| json!(n)),
        json_gs::values()
      ));
      json!({
        "formats": formats, "onlyMainContent": only_main_content, "onlyCleanContent": false,
        "timeout": timeout, "mobile": false, "removeBase64Images": true, "blockAds": true,
        "proxy": proxy, "storeInCache": true, "lockdown": false, "location": { "country": country },
      })
    }
    _ => {
      let mut base = json!({
        "formats": ["markdown"], "onlyMainContent": true, "onlyCleanContent": false,
        "mobile": false, "removeBase64Images": true, "blockAds": true, "proxy": "auto",
        "storeInCache": true, "lockdown": false,
      });
      let field = tc.draw(gs::sampled_from(vec![
        "formats", "headers", "includeTags", "excludeTags", "onlyMainContent", "onlyCleanContent",
        "timeout", "waitFor", "mobile", "parsers", "actions", "location", "skipTlsVerification",
        "removeBase64Images", "blockAds", "proxy", "maxAge", "minAge", "storeInCache", "lockdown",
        "profile",
      ]));
      base[field] = tc.draw(json_gs::values());
      base
    }
  }
}

#[hegel::composite]
fn internal_options_json_gen(tc: &TestCase) -> Value {
  if tc.draw(gs::booleans()) {
    tc.draw(json_gs::values())
  } else {
    let field = tc.draw(gs::sampled_from(vec![
      "crawlId",
      "priority",
      "v0CrawlOnlyUrls",
      "v0DisableJsDom",
      "disableSmartWaitCache",
      "isBackgroundIndex",
      "urlInvisibleInCurrentCrawl",
      "unnormalizedSourceURL",
      "saveScrapeResultToGCS",
      "bypassBilling",
      "zeroDataRetention",
      "teamFlags",
      "teamConcurrency",
      "v1OriginalFormat",
      "agentIndexOnly",
      "isPreCrawl",
    ]));
    let val = tc.draw(json_gs::values());
    json!({ field: val })
  }
}

#[hegel::composite]
fn scrape_error_gen(tc: &TestCase) -> ScrapeURLError {
  let msg = || gs::text().max_size(64);
  tc.draw(one_of!(
    msg().map(|reason| ScrapeURLError::CrawlDenialError { reason }),
    gs::just(1u8).map(|_| ScrapeURLError::LockdownMissError),
    gs::just(1u8).map(|_| ScrapeURLError::AgentIndexOnlyError),
    gs::sampled_from(vec![
      pdf_inspector::PdfType::TextBased, pdf_inspector::PdfType::Scanned,
      pdf_inspector::PdfType::ImageBased, pdf_inspector::PdfType::Mixed,
    ]).map(ScrapeURLError::PDFOCRRequiredError),
    gs::tuples!(gs::integers::<u32>(), gs::integers::<u64>()).map(
      |(page_count, min_timeout)| ScrapeURLError::PDFInsufficientTimeError { page_count, min_timeout }
    ),
    gs::tuples!(
      msg(),
      gs::optional(gs::tuples!(
        gs::optional(gs::integers::<u32>()), gs::booleans(), gs::integers::<u64>(), gs::optional(gs::booleans())
      ))
    ).map(|(message, proc_opt)| ScrapeURLError::ScrapeTimeout {
      message,
      processing: proc_opt.map(|(document_pages, running, min_timeout, may_exceed)| ScrapeTimeoutProcessing {
        state: ScrapeTimeoutProcessingState::ProcessingContinues,
        document_pages,
        job_status: if running { ScrapeTimeoutJobStatus::Running } else { ScrapeTimeoutJobStatus::Queued },
        estimated_remaining_seconds: min_timeout,
        retry_after_seconds: min_timeout.min(600),
        may_exceed_processing_window: may_exceed,
      }),
    }),
    msg().map(|code| ScrapeURLError::SiteError { code }),
    gs::booleans().map(|skip_tls_verification| ScrapeURLError::SSLError { skip_tls_verification }),
    msg().map(|hostname| ScrapeURLError::DNSResolutionError { hostname }),
    msg().map(|reason| ScrapeURLError::UnsupportedFileError { reason }),
    msg().map(|error| ScrapeURLError::ActionError { error }),
    gs::just(1u8).map(|_| ScrapeURLError::ProxySelectionError),
    gs::sampled_from(vec![ProxyMode::Auto, ProxyMode::Basic, ProxyMode::Enhanced])
      .map(ScrapeURLError::ReliableRetrievalError),
    gs::just(1u8).map(|_| ScrapeURLError::InsecureConnectionError),
    gs::just(1u8).map(|_| ScrapeURLError::InvalidURLError),
    gs::just(1u8).map(|_| ScrapeURLError::PDFFetchFailed),
    gs::just(1u8).map(|_| ScrapeURLError::PageLoadFailed),
    msg().map(|error| ScrapeURLError::UnclassifiedEngineError { engine: "fire-engine", error }),
    gs::integers::<u16>().map(|status| ScrapeURLError::EngineUnavailable { engine: "playwright", status }),
    gs::just(1u8).map(|_| ScrapeURLError::NoEnginesLeftError { fallback_list: vec!["fire-engine", "http"] }),
    gs::just(1u8).map(|_| ScrapeURLError::ActionsNotSupportedError),
    gs::just(1u8).map(|_| ScrapeURLError::NotSupported("test-feature")),
    msg().map(|error| ScrapeURLError::InvalidInput { argument: "options", error }),
    msg().map(ScrapeURLError::Panic),
    msg().map(ScrapeURLError::Internal),
    gs::just(1u8).map(|_| ScrapeURLError::Transformer(TransformerError::JsonContentTooLarge))
  ))
}

#[hegel::test]
fn parse_input_options_never_panics_and_reports_path(tc: TestCase) {
  let options_val = tc.draw(options_json_gen());
  let internal_val = tc.draw(internal_options_json_gen());

  let recorder = RecordedInputSpan::default();
  let subscriber = tracing_subscriber::registry().with(recorder.clone());

  tracing::subscriber::with_default(subscriber, || {
    let span = tracing::info_span!("test_input", input.argument = Empty, input.path = Empty);
    let _enter = span.enter();

    if let Err(err) = parse_input::<ScrapeOptions>("options", options_val) {
      let payload = err.payload();
      assert!(matches!(
        &payload,
        ScrapeErrorPayload::InvalidInput { argument, message }
          if argument == "options" && !message.is_empty()
      ));
      let path = recorder.path.lock().unwrap().take();
      assert!(
        path.as_deref().is_some_and(|p| !p.is_empty()),
        "expected non-empty input.path, got {path:?}"
      );
      let transport = err.to_failure_transport_string(CostTrackingJson::default());
      assert!(transport.starts_with("SCRAPE_INVALID_INPUT|"));
      assert_eq!(
        ScrapeFailure::from_transport_string(&transport).map(|f| f.error),
        Some(payload)
      );
    }

    if let Err(err) = parse_input::<InternalOptions>("internalOptions", internal_val) {
      let payload = err.payload();
      assert!(matches!(
        &payload,
        ScrapeErrorPayload::InvalidInput { argument, message }
          if argument == "internalOptions" && !message.is_empty()
      ));
      let path = recorder.path.lock().unwrap().take();
      assert!(
        path.as_deref().is_some_and(|p| !p.is_empty()),
        "expected non-empty input.path, got {path:?}"
      );
      let transport = err.to_failure_transport_string(CostTrackingJson::default());
      assert!(transport.starts_with("SCRAPE_INVALID_INPUT|"));
      assert_eq!(
        ScrapeFailure::from_transport_string(&transport).map(|f| f.error),
        Some(payload)
      );
    }
  });
}

#[hegel::test]
fn scrape_error_transport_round_trips(tc: TestCase) {
  let err = tc.draw(scrape_error_gen());
  let expected = err.payload();
  let transport = err.to_failure_transport_string(CostTrackingJson::default());
  let round_tripped = ScrapeFailure::from_transport_string(&transport);
  assert_eq!(round_tripped.as_ref().map(|f| &f.error), Some(&expected));

  let decoded_json = decode_scrape_url_error(transport);
  assert_eq!(decoded_json, round_tripped.and_then(|f| serde_json::to_value(f).ok()));

  let arbitrary_msg = tc.draw(gs::text().max_size(80));
  let _ = decode_scrape_url_error(arbitrary_msg);
}
