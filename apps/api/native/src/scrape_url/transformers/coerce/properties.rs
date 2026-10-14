use hegel::{
  TestCase,
  generators::{self as gs},
};
use serde_json::Value;
use url::Url;

use super::super::super::{
  actions::Action,
  formats::{Format, FormatKind, HighlightsOptions, QueryOptions, QuestionOptions},
  meta::Meta,
  options::{InternalOptions, ScrapeOptions, V1OriginalFormat},
  parsers::parse_engine_result,
  raw_page::{
    JavascriptActionContent, RawPageActions, RawPageContent, RawPageResult, ScrapeActionContent,
    ScrapeProxy,
  },
};
use super::coerce_fields_to_formats;

const PAGE_URL: &str = "https://example.com/dir/page.html";

fn all_formats() -> Vec<Format> {
  vec![
    Format::Markdown,
    Format::Html,
    Format::RawHtml,
    Format::RawBase64,
    Format::Links,
    Format::Images,
    Format::Summary,
    Format::Json(Default::default()),
    Format::DeterministicJson(Default::default()),
    Format::Screenshot(Default::default()),
    Format::Question(QuestionOptions::default()),
    Format::Highlights(HighlightsOptions::default()),
    Format::Query(QueryOptions::default()),
    Format::Audio,
    Format::Video,
  ]
}

#[hegel::composite]
fn page_actions(tc: &TestCase) -> RawPageActions {
  let url = Url::parse(PAGE_URL).unwrap();
  let some = |tc: &TestCase| tc.draw(gs::booleans());
  RawPageActions {
    screenshots: if some(tc) { vec![url.clone()] } else { vec![] },
    scrapes: if some(tc) {
      vec![ScrapeActionContent {
        url: PAGE_URL.to_string(),
        html: String::new(),
      }]
    } else {
      vec![]
    },
    javascript_returns: if some(tc) {
      vec![JavascriptActionContent {
        r#type: "number".to_string(),
        value: Value::from(1),
      }]
    } else {
      vec![]
    },
    pdfs: if some(tc) { vec![url] } else { vec![] },
  }
}

/// Which top-level Document fields coerce may leave in place, given the request.
fn kept(meta: &Meta, field: &str, value: &Value) -> bool {
  use FormatKind::*;
  let has = |kind| meta.options.formats.contains(kind);
  let has_json = has(Json) || has(DeterministicJson);
  let v1 = meta.internal_options.v1_original_format;
  match field {
    "markdown" => has(Markdown),
    "html" => has(Html),
    "rawHtml" => has(RawHtml),
    "rawBase64" => has(RawBase64),
    "links" => has(Links),
    "images" => has(Images),
    "screenshot" => has(Screenshot),
    "summary" => has(Summary),
    "answer" => has(Question) || has(Query),
    "highlights" => has(Highlights),
    "audio" => has(Audio),
    "video" => has(Video),
    "extract" => has_json || v1 == Some(V1OriginalFormat::Extract),
    "json" => has_json || v1 == Some(V1OriginalFormat::Json),
    "actions" => {
      !meta.options.actions.is_empty() && value.as_object().is_some_and(|x| !x.is_empty())
    }
    _ => true,
  }
}

#[tokio::test]
#[hegel::test]
async fn coerce_keeps_only_requested_fields_and_is_idempotent(tc: TestCase) {
  let mut options = ScrapeOptions::default();
  options.formats = tc
    .draw(gs::subsequences(all_formats()))
    .into_iter()
    .collect();
  if tc.draw(gs::booleans()) {
    options.actions = vec![Action::Scrape];
  }
  let internal_options = InternalOptions {
    v1_original_format: tc.draw(gs::optional(gs::sampled_from(&[
      V1OriginalFormat::Extract,
      V1OriginalFormat::Json,
    ]))),
    ..InternalOptions::default()
  };
  let url = Url::parse(PAGE_URL).unwrap();
  let meta = Meta::new("p".into(), url, "t".into(), options, internal_options);

  let text = || gs::optional(gs::text().max_size(8));
  let page = RawPageResult {
    url: Url::parse(PAGE_URL).unwrap(),
    status_code: 200,
    content: RawPageContent::ChromeRenderedDOM(String::new()),
    screenshot: None,
    actions: None,
    cached_at: None,
    content_type: "text/html".to_string(),
    audio_cookies: Vec::new(),
    proxy_used: ScrapeProxy::Basic,
    timezone: None,
    filename: None,
  };
  let mut document = parse_engine_result(&meta, page).await.unwrap();
  document.markdown = tc.draw(text());
  document.html = tc.draw(text());
  document.raw_html = tc.draw(text());
  document.raw_base64 = tc.draw(text());
  document.links = tc.draw(gs::optional(gs::vecs(gs::text().max_size(8)).max_size(2)));
  document.images = tc.draw(gs::optional(gs::vecs(gs::text().max_size(8)).max_size(2)));
  document.screenshot = tc
    .draw(gs::booleans())
    .then(|| Url::parse(PAGE_URL).unwrap());
  document.summary = tc.draw(text());
  document.answer = tc.draw(text());
  document.highlights = tc.draw(text());
  document.audio = tc.draw(text());
  document.video = tc.draw(text());
  document.extract = tc.draw(gs::optional(hegel::extras::serde_json::values()));
  document.json = tc.draw(gs::optional(hegel::extras::serde_json::values()));
  document.actions = tc.draw(gs::optional(page_actions()));
  document.warning = tc.draw(text());

  let before = serde_json::to_value(&document).unwrap();
  let once = coerce_fields_to_formats(&meta, document).await.unwrap();
  let once_value = serde_json::to_value(&once).unwrap();
  let expected: serde_json::Map<String, Value> = before
    .as_object()
    .unwrap()
    .iter()
    .filter(|(field, value)| kept(&meta, field, value))
    .map(|(field, value)| (field.clone(), value.clone()))
    .collect();
  assert_eq!(once_value, Value::Object(expected));

  let twice = coerce_fields_to_formats(&meta, once).await.unwrap();
  assert_eq!(serde_json::to_value(&twice).unwrap(), once_value);
}
