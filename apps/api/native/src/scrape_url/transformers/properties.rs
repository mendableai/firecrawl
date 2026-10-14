use hegel::{
  TestCase,
  generators::{self as gs, Generator},
};
use url::Url;

use super::super::{
  document::Document,
  error::{ScrapeErrorPayload, ScrapeURLError},
  formats::{AttributesOptions, AttributesSelector, Format},
  meta::Meta,
  options::{InternalOptions, ScrapeOptions},
  parsers::parse_engine_result,
  raw_page::{RawPageContent, RawPageResult, ScrapeProxy},
};
use super::{
  TransformerError, attributes::derive_attributes_from_html, base64_images::remove_base64_images,
  images::derive_images_from_html, links::derive_links_from_html,
  metadata::derive_metadata_from_raw_html,
};

const PAGE_URL: &str = "https://example.com/dir/page.html";

const TAGS: &[&str] = &[
  "html", "head", "body", "title", "meta", "link", "base", "a", "img", "picture", "source",
  "video", "div", "p", "span", "script", "style", "noscript", "template", "svg", "iframe", "table",
  "td", "br", "frameset",
];

const ATTRIBUTES: &[&str] = &[
  "href",
  "src",
  "data-src",
  "srcset",
  "content",
  "name",
  "property",
  "itemprop",
  "rel",
  "charset",
  "http-equiv",
  "lang",
  "poster",
  "style",
  "class",
  "id",
  "alt",
  "data-href",
];

const URLS: &[&str] = &[
  "",
  "/",
  "#top",
  "?q=1&b=2",
  "../a/./b.png",
  "//cdn.example.org/x.jpg",
  "http:/a.com/b",
  "https:/a.com/b",
  "javascript:alert(1)",
  "data:image/png;base64,iVBORw0KGgo=",
  "blob:https://example.com/1",
  "mailto:a@b.c",
  "http://[::1]:99999/",
  "https://exa mple.com/ä",
  "\\\\server\\share",
  "og:image",
  "icon",
  "description",
  "og:locale:alternate",
];

const TEXT: &[&str] = &[
  "&amp;",
  "&#x1F600;",
  "&#0;",
  "&nbsp;",
  "<!-- c -->",
  "<![CDATA[x]]>",
  "</p>",
  "<",
  "]]>",
  "<!DOCTYPE html>",
  "<?xml version=\"1.0\"?>",
  "\u{0}",
];

const PSEUDO: &[&str] = &[
  ":first-child",
  ":nth-child(2n+1)",
  ":nth-last-of-type(-n+3)",
  ":not(p)",
  ":has(img)",
  ":is(a, b)",
  ":where(.x)",
  "::before",
  ":hover",
  ":lang(en)",
  ":root",
  ":empty",
  ":nth-child(",
];

#[hegel::composite]
fn url_text(tc: &TestCase) -> String {
  tc.draw(hegel::one_of!(
    gs::sampled_from(URLS).map(|x: &str| x.to_string()),
    gs::urls(),
    gs::text().max_size(24),
  ))
}

#[hegel::composite]
fn attribute_value(tc: &TestCase) -> String {
  let url = tc.draw(url_text());
  match tc.draw(gs::integers::<u8>().max_value(3)) {
    0 => url,
    1 => format!("{url} 1x, {} 2x", tc.draw(url_text())),
    2 => format!("background-image: url('{url}')"),
    _ => tc.draw(gs::text().max_size(24)),
  }
}

#[hegel::composite]
fn html_text(tc: &TestCase) -> String {
  tc.draw(hegel::one_of!(
    gs::text().max_size(24),
    gs::sampled_from(TEXT).map(|x: &str| x.to_string()),
  ))
}

/// Possibly malformed HTML: unclosed tags, unquoted attributes, stray markup.
#[hegel::composite]
fn html_node(tc: &TestCase, depth: u32) -> String {
  if depth == 0 || tc.draw(gs::weighted_booleans(0.3)) {
    return tc.draw(html_text());
  }
  let tag = tc.draw(gs::sampled_from(TAGS));
  let quote = tc.draw(gs::sampled_from(&["\"", "'", ""]));
  let attributes: Vec<(&str, String)> =
    tc.draw(gs::vecs(gs::tuples!(gs::sampled_from(ATTRIBUTES), attribute_value())).max_size(4));
  let attributes: String = attributes
    .iter()
    .map(|(name, value)| format!(" {name}={quote}{value}{quote}"))
    .collect();
  let children = tc.draw(gs::vecs(html_node(depth - 1)).max_size(4)).concat();
  let close = if tc.draw(gs::booleans()) {
    format!("</{tag}>")
  } else {
    String::new()
  };
  format!("<{tag}{attributes}>{children}{close}")
}

#[hegel::composite]
fn html_document(tc: &TestCase) -> String {
  tc.draw(gs::vecs(html_node(3)).max_size(4)).concat()
}

#[hegel::composite]
fn css_compound(tc: &TestCase) -> String {
  let tag = tc.draw(hegel::one_of!(
    gs::sampled_from(TAGS).map(|x: &str| x.to_string()),
    gs::sampled_from(&["*", ""]).map(|x: &str| x.to_string()),
  ));
  let ident = || gs::text().alphabet("abcxyz-_09").max_size(6);
  let attribute = || gs::sampled_from(ATTRIBUTES).map(|x: &str| x.to_string());
  let simple = tc.draw(
    gs::vecs(hegel::one_of!(
      ident().map(|x| format!(".{x}")),
      ident().map(|x| format!("#{x}")),
      attribute().map(|x| format!("[{x}]")),
      gs::tuples!(
        attribute(),
        gs::sampled_from(&["=", "~=", "|=", "^=", "$=", "*="]),
        url_text()
      )
      .map(|(name, op, value)| format!("[{name}{op}\"{value}\"]")),
      gs::sampled_from(PSEUDO).map(|x: &str| x.to_string()),
    ))
    .max_size(3),
  );
  format!("{tag}{}", simple.concat())
}

#[hegel::composite]
fn attribute_selector(tc: &TestCase) -> AttributesSelector {
  let selector = tc.draw(hegel::one_of!(
    gs::tuples!(
      css_compound(),
      gs::vecs(gs::tuples!(
        gs::sampled_from(&[" ", " > ", " + ", " ~ ", ", "]),
        css_compound()
      ))
      .max_size(2)
    )
    .map(|(first, rest)| rest
      .into_iter()
      .fold(first, |selector, (combinator, compound)| selector
        + combinator
        + &compound)),
    gs::text().max_size(16),
  ));
  let attribute = tc.draw(hegel::one_of!(
    gs::sampled_from(ATTRIBUTES).map(|x: &str| x.to_string()),
    gs::text().max_size(8),
  ));
  AttributesSelector {
    selector,
    attribute,
  }
}

/// Markdown mixing text with `data:image` images; also returns each image's target.
#[hegel::composite]
fn markdown_with_data_images(tc: &TestCase) -> (String, Vec<String>) {
  let mut markdown = String::new();
  let mut targets = Vec::new();
  for _ in 0..tc.draw(gs::integers::<u8>().max_value(8)) {
    if tc.draw(gs::booleans()) {
      markdown += &tc.draw(hegel::one_of!(
        gs::text().max_size(24),
        gs::sampled_from(&["\n", "![", "](", ")", "![x](https://example.com/a.png)"])
          .map(|x: &str| x.to_string()),
      ));
      continue;
    }
    let alt = tc.draw(gs::text().max_size(12).exclude_characters("\n"));
    let subtype = tc.draw(hegel::one_of!(
      gs::sampled_from(&["png", "jpeg", "svg+xml", "svg+xml;charset=utf-8", ""])
        .map(|x: &str| x.to_string()),
      gs::text().max_size(8).exclude_characters("\n"),
    ));
    let payload = tc.draw(
      gs::text()
        .alphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=")
        .max_size(40),
    );
    let target = format!("(data:image/{subtype};base64,{payload})");
    markdown += &format!("![{alt}]{target}");
    targets.push(target);
  }
  (markdown, targets)
}

fn meta(options: ScrapeOptions, internal_options: InternalOptions) -> Meta {
  let url = Url::parse(PAGE_URL).unwrap();
  Meta::new(
    "p".into(),
    url,
    "t".into(),
    options,
    internal_options,
    Default::default(),
  )
}

async fn rendered_page(meta: &Meta, html: &str) -> Document {
  let result = RawPageResult {
    url: Url::parse(PAGE_URL).unwrap(),
    status_code: 200,
    content: RawPageContent::ChromeRenderedDOM(html.to_string()),
    screenshot: None,
    actions: None,
    cached_at: None,
    content_type: "text/html".to_string(),
    audio_cookies: Vec::new(),
    proxy_used: ScrapeProxy::Basic,
    timezone: None,
    filename: None,
  };
  parse_engine_result(meta, result).await.unwrap()
}

/// A panic in a transformer's blocking task surfaces as `SCRAPE_PANIC`, never as a typed error.
fn typed(result: Result<Document, TransformerError>) -> Option<Document> {
  let error = match result {
    Ok(document) => return Some(document),
    Err(error) => error,
  };
  let payload = ScrapeURLError::from(error).payload();
  assert!(
    !matches!(payload, ScrapeErrorPayload::Panic { .. }),
    "{payload:?}"
  );
  None
}

#[tokio::test]
#[hegel::test]
async fn html_transformers_never_panic(tc: TestCase) {
  let html = tc.draw(html_document());
  let selectors = tc.draw(gs::vecs(attribute_selector()).max_size(3));
  let mut options = ScrapeOptions::default();
  options.formats = [
    Format::Links,
    Format::Images,
    Format::Attributes(AttributesOptions { selectors }),
  ]
  .into_iter()
  .collect();
  let meta = meta(options, InternalOptions::default());
  let mut document = rendered_page(&meta, &html).await;
  document.html = Some(html);

  let Some(document) = typed(derive_links_from_html(&meta, document).await) else {
    return;
  };
  let Some(document) = typed(derive_images_from_html(&meta, document).await) else {
    return;
  };
  let Some(document) = typed(derive_metadata_from_raw_html(&meta, document).await) else {
    return;
  };
  let Some(document) = typed(derive_attributes_from_html(&meta, document).await) else {
    return;
  };
  typed(remove_base64_images(&meta, document).await);
}

#[tokio::test]
#[hegel::test]
async fn remove_base64_images_is_idempotent(tc: TestCase) {
  let (markdown, targets) = tc.draw(markdown_with_data_images());
  let meta = meta(ScrapeOptions::default(), InternalOptions::default());
  let mut document = rendered_page(&meta, "").await;
  document.markdown = Some(markdown);

  let once = typed(remove_base64_images(&meta, document).await).unwrap();
  let once_markdown = once.markdown.clone().unwrap();
  for target in &targets {
    assert!(
      !once_markdown.contains(target.as_str()),
      "{target} survived"
    );
  }
  let twice = typed(remove_base64_images(&meta, once).await).unwrap();
  assert_eq!(twice.markdown.unwrap(), once_markdown);
}
