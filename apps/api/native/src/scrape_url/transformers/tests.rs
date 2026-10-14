use std::{collections::HashMap, sync::Arc};

use hegel::generators as gs;
use hegel::{TestCase, one_of};
use serde_json::json;
use url::Url;

use super::super::{
  actions::Action,
  document::{Document, DocumentMetadata, DocumentMetadataCacheState},
  formats::{
    AttributesOptions, AttributesSelector, DeterministicJsonOptions, Format, FormatKind,
    HighlightsOptions, JsonOptions, QueryOptions, QuestionOptions, ScreenshotOptions,
  },
  meta::Meta,
  options::{InternalOptions, ScrapeOptions, V1OriginalFormat},
  raw_page::{RawPageActions, ScrapeActionContent, ScrapeProxy},
};
use super::{
  TransformerError, attributes::derive_attributes_from_html, base64_images::remove_base64_images,
  coerce::coerce_fields_to_formats, html::derive_html_from_raw_html,
  images::derive_images_from_html, links::derive_links_from_html,
  metadata::derive_metadata_from_raw_html,
};

#[hegel::composite]
fn generated_document(tc: &TestCase) -> Document {
  let mask = tc.draw(gs::integers::<u16>());
  let non_empty_actions = tc.draw(gs::booleans());
  let bit = |i: u16| (mask & (1 << i)) != 0;
  let url = Url::parse("https://example.com/page").expect("valid static URL");

  Document {
    markdown: bit(0).then(|| "md".to_string()),
    html: bit(3).then(|| "<p>html</p>".to_string()),
    raw_html: bit(1).then(|| "<p>raw</p>".to_string()),
    raw_base64: bit(2).then(|| "YWI=".to_string()),
    links: bit(5).then(|| vec!["https://example.com".to_string()]),
    images: bit(6).then(|| vec!["https://example.com/i.png".to_string()]),
    screenshot: bit(4).then(|| Url::parse("https://example.com/s.png").expect("valid URL")),
    audio: bit(12).then(|| "aud".to_string()),
    video: bit(13).then(|| "vid".to_string()),
    extract: bit(7).then(|| json!({"a": 1})),
    json: bit(8).then(|| json!({"b": 2})),
    summary: bit(9).then(|| "sum".to_string()),
    answer: bit(10).then(|| "ans".to_string()),
    highlights: bit(11).then(|| "hi".to_string()),
    pages: None,
    blocks: None,
    warning: None,
    attributes: None,
    actions: bit(14).then(|| RawPageActions {
      screenshots: Vec::new(),
      scrapes: if non_empty_actions {
        vec![ScrapeActionContent {
          url: "https://example.com".to_string(),
          html: "<p>x</p>".to_string(),
        }]
      } else {
        Vec::new()
      },
      javascript_returns: Vec::new(),
      pdfs: Vec::new(),
    }),
    metadata: DocumentMetadata {
      extra: HashMap::new(),
      title: None,
      scrape_id: "test-scrape-id".to_string(),
      source_url: url.to_string(),
      url,
      status_code: 200,
      num_pages: None,
      total_pages: None,
      content_type: "text/html".to_string(),
      timezone: None,
      proxy_used: ScrapeProxy::Basic,
      cache_state: DocumentMetadataCacheState::Miss,
      cached_at: None,
      index_id: None,
      credits_used: None,
      concurrency_limited: false,
      concurrency_queue_duration_ms: None,
      postprocessors_used: None,
    },
  }
}

#[hegel::composite]
fn markdown_segment(tc: &TestCase) -> String {
  let kind = tc.draw(gs::integers::<u8>().min_value(0).max_value(2));
  match kind {
    0 => tc.draw(gs::text().max_size(32)),
    1 => {
      let alt = tc.draw(gs::text().max_size(24));
      let mime = tc.draw(one_of!(
        gs::sampled_from(vec![
          "png".to_string(),
          "jpeg".to_string(),
          "svg+xml".to_string(),
          "webp".to_string(),
        ]),
        gs::from_regex(r"[a-z0-9.+-]{1,12}")
      ));
      let payload = tc.draw(one_of!(
        gs::from_regex(r"[A-Za-z0-9+/=\r\n]{0,32}"),
        gs::text().max_size(24)
      ));
      let prefix = if tc.draw(gs::booleans()) {
        format!("![{alt}]")
      } else {
        "]".to_string()
      };
      format!("{prefix}(data:image/{mime};base64,{payload})")
    }
    _ => {
      let alt = tc.draw(gs::text().max_size(16));
      format!("![{alt}](https://example.com/image.png)")
    }
  }
}

#[hegel::test]
fn html_transformers_never_panic(tc: TestCase) {
  let raw_html = tc.draw(gs::optional(gs::text().max_size(120)));
  let html = tc.draw(gs::optional(gs::text().max_size(120)));
  let markdown = tc.draw(gs::optional(gs::text().max_size(120)));
  let only_main_content = tc.draw(gs::booleans());
  let remove_b64 = tc.draw(gs::booleans());
  let include_tags = tc.draw(gs::vecs(gs::text().max_size(16)).max_size(3));
  let exclude_tags = tc.draw(gs::vecs(gs::text().max_size(16)).max_size(3));
  let selector_pairs =
    tc.draw(gs::vecs(gs::tuples!(gs::text().max_size(16), gs::text().max_size(16))).max_size(3));
  let [d1, d2, d3, d4, d5, d6] = std::array::from_fn(|_| {
    let mut d = tc.draw(generated_document());
    d.raw_html = raw_html.clone();
    d.html = html.clone();
    d.markdown = markdown.clone();
    d
  });

  let mut options = ScrapeOptions::default();
  options.only_main_content = only_main_content;
  options.remove_base64_images = remove_b64;
  options.include_tags = include_tags;
  options.exclude_tags = exclude_tags;
  options.formats = [
    Format::Markdown,
    Format::Html,
    Format::Links,
    Format::Images,
    Format::Attributes(AttributesOptions {
      selectors: selector_pairs
        .into_iter()
        .map(|(selector, attribute)| AttributesSelector {
          selector,
          attribute,
        })
        .collect(),
    }),
  ]
  .into_iter()
  .collect();

  let meta = Meta::new(
    "test-id".to_string(),
    Url::parse("https://example.com/dir/page.html").expect("valid static URL"),
    "test-team".to_string(),
    options,
    InternalOptions::default(),
    Arc::default(),
  );

  let rt = tokio::runtime::Builder::new_current_thread()
    .enable_all()
    .build()
    .expect("tokio runtime");

  rt.block_on(async {
    for res in [
      derive_html_from_raw_html(&meta, d1).await,
      derive_links_from_html(&meta, d2).await,
      derive_images_from_html(&meta, d3).await,
      derive_metadata_from_raw_html(&meta, d4).await,
      derive_attributes_from_html(&meta, d5).await,
      remove_base64_images(&meta, d6).await,
    ] {
      assert!(
        !matches!(res, Err(TransformerError::Join(_))),
        "blocking transformer task panicked or was cancelled: {res:?}"
      );
    }
  });
}

#[hegel::test]
fn remove_base64_images_idempotent_and_complete(tc: TestCase) {
  let mut doc1 = tc.draw(generated_document());
  let segments = tc.draw(gs::vecs(markdown_segment()).max_size(6));
  let markdown = segments.join(" ");
  let remove_flag = tc.draw(gs::booleans());
  doc1.markdown = Some(markdown.clone());

  let mut options = ScrapeOptions::default();
  options.remove_base64_images = remove_flag;
  let meta = Meta::new(
    "test-id".to_string(),
    Url::parse("https://example.com").expect("valid static URL"),
    "test-team".to_string(),
    options,
    InternalOptions::default(),
    Arc::default(),
  );

  let rt = tokio::runtime::Builder::new_current_thread()
    .enable_all()
    .build()
    .expect("tokio runtime");

  let (once_md, twice_md) = rt.block_on(async {
    let doc1 = remove_base64_images(&meta, doc1).await.expect("ok");
    let once = doc1.markdown.clone().expect("markdown present");
    let doc2 = remove_base64_images(&meta, doc1).await.expect("ok");
    let twice = doc2.markdown.expect("markdown present");
    (once, twice)
  });

  assert_eq!(once_md, twice_md, "remove_base64_images must be idempotent");
  if remove_flag {
    assert!(
      !regex::Regex::new(r"(?s)!\[.*?\]\(data:image/.*?;base64,.*?\)")
        .unwrap()
        .is_match(&once_md),
      "base64 markdown image survived remove_base64_images: {once_md:?}"
    );
  } else {
    assert_eq!(once_md, markdown);
  }
}

#[hegel::test]
fn coerce_fields_to_formats_idempotent_and_exact(tc: TestCase) {
  let mask = tc.draw(gs::integers::<u16>());
  let bit = |i: u16| (mask & (1 << i)) != 0;
  let v1_fmt = tc.draw(gs::sampled_from(vec![
    None,
    Some(V1OriginalFormat::Extract),
    Some(V1OriginalFormat::Json),
  ]));
  let mut options = ScrapeOptions::default();
  options.formats = [
    (0, Format::Markdown), (1, Format::RawHtml), (2, Format::RawBase64), (3, Format::Html),
    (4, Format::Screenshot(ScreenshotOptions::default())), (5, Format::Links), (6, Format::Images),
    (7, Format::Json(JsonOptions::default())),
    (8, Format::DeterministicJson(DeterministicJsonOptions::default())),
    (9, Format::Summary), (10, Format::Question(QuestionOptions::default())),
    (11, Format::Query(QueryOptions::default())),
    (12, Format::Highlights(HighlightsOptions::default())),
    (13, Format::Audio), (14, Format::Video),
  ]
  .into_iter()
  .filter_map(|(i, fmt)| bit(i).then_some(fmt))
  .collect();
  if bit(15) {
    options.actions = vec![Action::Scrape];
  }
  let internal = InternalOptions { v1_original_format: v1_fmt, ..Default::default() };
  let url = Url::parse("https://example.com").expect("valid static URL");
  let meta = Meta::new("test-id".to_string(), url, "test-team".to_string(), options, internal, Arc::default());
  let doc = tc.draw(generated_document());
  let before = serde_json::to_value(&doc).expect("serialize before");
  let had_actions = doc.actions.as_ref().is_some_and(|a| !a.scrapes.is_empty());

  let rt = tokio::runtime::Builder::new_current_thread()
    .enable_all()
    .build()
    .expect("tokio runtime");

  let once = rt.block_on(async {
    let once = coerce_fields_to_formats(&meta, doc).await.expect("ok");
    let once_json = serde_json::to_value(&once).expect("serialize once");
    let twice = coerce_fields_to_formats(&meta, once).await.expect("ok");
    let twice_json = serde_json::to_value(&twice).expect("serialize twice");
    assert_eq!(once_json, twice_json, "coerce_fields_to_formats must be idempotent");
    twice
  });

  let has = |k: FormatKind| meta.options.formats.contains(k);
  let has_json = has(FormatKind::Json) || has(FormatKind::DeterministicJson);
  let has_answer = has(FormatKind::Question) || has(FormatKind::Query);
  let had = |f: &str| !before[f].is_null();

  assert_eq!(once.markdown.is_some(), had("markdown") && has(FormatKind::Markdown));
  assert_eq!(once.raw_html.is_some(), had("rawHtml") && has(FormatKind::RawHtml));
  assert_eq!(once.raw_base64.is_some(), had("rawBase64") && has(FormatKind::RawBase64));
  assert_eq!(once.html.is_some(), had("html") && has(FormatKind::Html));
  assert_eq!(once.screenshot.is_some(), had("screenshot") && has(FormatKind::Screenshot));
  assert_eq!(once.links.is_some(), had("links") && has(FormatKind::Links));
  assert_eq!(once.images.is_some(), had("images") && has(FormatKind::Images));
  assert_eq!(
    once.extract.is_some(),
    had("extract") && (has_json || v1_fmt == Some(V1OriginalFormat::Extract))
  );
  assert_eq!(
    once.json.is_some(),
    had("json") && (has_json || v1_fmt == Some(V1OriginalFormat::Json))
  );
  assert_eq!(once.summary.is_some(), had("summary") && has(FormatKind::Summary));
  assert_eq!(once.answer.is_some(), had("answer") && has_answer);
  assert_eq!(once.highlights.is_some(), had("highlights") && has(FormatKind::Highlights));
  assert_eq!(once.audio.is_some(), had("audio") && has(FormatKind::Audio));
  assert_eq!(once.video.is_some(), had("video") && has(FormatKind::Video));
  assert_eq!(once.actions.is_some(), had_actions && !meta.options.actions.is_empty());
}
