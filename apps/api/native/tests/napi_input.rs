// The scrape future nests deeper than the default limit lets a test crate lay it out.
#![recursion_limit = "256"]

use std::sync::{Arc, Mutex};

use firecrawl_rs::{decode_scrape_url_error, scrape_url};
use hegel::{
  TestCase,
  extras::serde_json as json_gs,
  generators::{self as gs, Generator},
};
use serde_json::{Value, json};
use tracing::{
  Subscriber,
  field::{Field, Visit},
  span,
};
use tracing_subscriber::{
  Layer,
  layer::{Context, SubscriberExt},
  registry::LookupSpan,
};

const OPTION_KEYS: &[&str] = &[
  "formats",
  "headers",
  "includeTags",
  "excludeTags",
  "onlyMainContent",
  "onlyCleanContent",
  "timeout",
  "waitFor",
  "mobile",
  "parsers",
  "actions",
  "location",
  "skipTlsVerification",
  "removeBase64Images",
  "blockAds",
  "proxy",
  "maxAge",
  "minAge",
  "storeInCache",
  "lockdown",
  "profile",
  "__searchPreviewToken",
  "__experimental_omce",
  "__forceFirePDF",
];

const INTERNAL_OPTION_KEYS: &[&str] = &[
  "crawlId",
  "priority",
  "v0CrawlOnlyUrls",
  "disableSmartWaitCache",
  "unnormalizedSourceURL",
  "saveScrapeResultToGCS",
  "zeroDataRetention",
  "teamFlags",
  "teamConcurrency",
  "v1OriginalFormat",
  "agentIndexOnly",
];

/// Values shaped like what the API forwards, valid or nearly so for some key.
const VALUES: &[&str] = &[
  r#"["markdown", "html", "rawHtml", "links", "images", "summary"]"#,
  r#"["markdown", "markdown"]"#,
  r#"[{"type": "json", "prompt": "x", "schema": {"type": "object"}}]"#,
  r#"[{"type": "screenshot", "fullPage": true, "viewport": {"width": 0, "height": 99999}}]"#,
  r#"[{"type": "attributes", "selectors": [{"selector": "a", "attribute": "href"}]}]"#,
  r#"[{"type": "query", "prompt": "q", "mode": "directQuote"}, "branding"]"#,
  r#"[{"type": "bogus"}, {"fullPage": true}]"#,
  r#"[{"type": "pdf", "mode": "fast", "maxPages": -1}, "image"]"#,
  r#"[{"type": "wait", "milliseconds": 1}, {"type": "wait", "milliseconds": 1, "selector": "a"}]"#,
  r#"[{"type": "click", "selector": ".a"}, {"type": "scroll", "direction": "sideways"}]"#,
  r#"[{"type": "getCookies"}, {"type": "pdf", "format": "A4", "scale": 1e308}]"#,
  r#"{"country": "hu", "languages": ["en"]}"#,
  r#"{"country": "zz"}"#,
  r#"{"name": "", "saveChanges": "yes"}"#,
  r#"{"largePdfs": true}"#,
  r#"{"X-A": "b", "c": 1}"#,
  r#""stealth""#,
  r#""enhanced""#,
  r#""extract""#,
  "-1",
  "4294967296",
  "18446744073709551616",
  "1e400",
  "0.5",
  "null",
  "true",
  r#""""#,
];

#[hegel::composite]
fn value(tc: &TestCase) -> Value {
  tc.draw(hegel::one_of!(
    gs::sampled_from(VALUES).map(|x: &str| serde_json::from_str(x).unwrap_or(Value::Null)),
    json_gs::values(),
  ))
}

/// `base` with keys replaced, removed or added; sometimes not an object at all.
#[hegel::composite]
fn input(tc: &TestCase, keys: &'static [&'static str], base: Value) -> Value {
  if tc.draw(gs::weighted_booleans(0.05)) {
    return tc.draw(json_gs::values());
  }
  let mut object = base;
  for _ in 0..tc.draw(gs::integers::<u8>().max_value(4)) {
    let key = tc.draw(hegel::one_of!(
      gs::sampled_from(keys).map(|x: &str| x.to_string()),
      gs::text().max_size(8),
    ));
    match tc.draw(gs::optional(value())) {
      Some(value) => object[key] = value,
      None => {
        object.as_object_mut().map(|x| x.remove(&key));
      }
    }
  }
  object
}

/// The `input.path` recorded on the scrape span.
#[derive(Clone, Default)]
struct InputPath(Arc<Mutex<Option<String>>>);

impl Visit for InputPath {
  fn record_str(&mut self, field: &Field, value: &str) {
    if field.name() == "input.path" {
      *self.0.lock().unwrap() = Some(value.to_string());
    }
  }

  fn record_debug(&mut self, _: &Field, _: &dyn std::fmt::Debug) {}
}

impl<S: Subscriber + for<'a> LookupSpan<'a>> Layer<S> for InputPath {
  fn on_record(&self, _: &span::Id, values: &span::Record<'_>, _: Context<'_, S>) {
    values.record(&mut self.clone());
  }
}

/// With an unparseable URL, valid input ends in SCRAPE_INVALID_URL_ERROR before any I/O.
#[tokio::test]
#[hegel::test]
async fn invalid_input_is_reported_with_its_path(tc: TestCase) {
  let options = tc.draw(input(
    OPTION_KEYS,
    json!({
      "formats": ["markdown"],
      "onlyMainContent": true,
      "onlyCleanContent": false,
      "mobile": false,
      "removeBase64Images": true,
      "blockAds": true,
      "proxy": "auto",
      "storeInCache": true,
      "lockdown": false,
    }),
  ));
  let internal_options = tc.draw(input(INTERNAL_OPTION_KEYS, json!({})));
  let path = InputPath::default();
  let _guard = tracing::subscriber::set_default(tracing_subscriber::registry().with(path.clone()));

  let rejection = scrape_url(
    "p".into(),
    "not a url".into(),
    "t".into(),
    options,
    internal_options,
  )
  .await
  .unwrap_err();
  let payload = decode_scrape_url_error(rejection.reason.clone()).unwrap();
  let path = path.0.lock().unwrap().clone();
  match payload["code"].as_str() {
    Some("SCRAPE_INVALID_INPUT") => assert!(path.is_some_and(|x| !x.is_empty()), "{payload}"),
    Some("SCRAPE_INVALID_URL_ERROR") => assert_eq!(path, None),
    _ => panic!("{payload}"),
  }
}
