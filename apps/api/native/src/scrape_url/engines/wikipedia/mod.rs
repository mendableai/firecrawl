//! Wikimedia articles through the Wikipedia Enterprise API, wrapped in an HTML document.

use std::{
  sync::{LazyLock, OnceLock},
  time::Duration,
};

use ::url::Url;
use percent_encoding::{AsciiSet, NON_ALPHANUMERIC, utf8_percent_encode};
use regex::Regex;
use serde::Deserialize;
use serde_json::json;
use tracing::{Span, field::Empty};

use self::{
  auth::{access_token, clear_cached_token},
  url::{WikimediaUrl, resolve_redirect},
};
use super::super::{
  error::ScrapeURLError,
  feature_flags::{ConstFeatureFlags, FeatureFlag},
  meta::Meta,
  raw_page::{RawPageContent, RawPageResult, ScrapeProxy},
};
use super::{Engine, EngineKind, EngineOutcome};

mod auth;
mod url;

pub use self::url::parse_wikimedia_url;

const API_BASE: &str = "https://api.enterprise.wikimedia.com/v2";
/// The engine's whole budget, within the scrape deadline; past it the main engine takes over.
const TIME_LIMIT: Duration = Duration::from_secs(10);
/// What TS sends. Wikimedia rejects requests without a User-Agent.
const USER_AGENT: &str = "undici";
/// What `encodeURIComponent` leaves unescaped.
const URI_COMPONENT: &AsciiSet = &NON_ALPHANUMERIC
  .remove(b'-')
  .remove(b'_')
  .remove(b'.')
  .remove(b'!')
  .remove(b'~')
  .remove(b'*')
  .remove(b'\'')
  .remove(b'(')
  .remove(b')');

static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

static CREDENTIALS: LazyLock<Option<(String, String)>> = LazyLock::new(|| {
  let var = |name| std::env::var(name).ok().filter(|x: &String| !x.is_empty());
  Some((
    var("WIKIPEDIA_ENTERPRISE_USERNAME")?,
    var("WIKIPEDIA_ENTERPRISE_PASSWORD")?,
  ))
});

fn engine_error(error: String) -> ScrapeURLError {
  ScrapeURLError::UnclassifiedEngineError {
    engine: WikipediaEngine::NAME,
    error,
  }
}

#[derive(Deserialize)]
struct Named {
  #[serde(default)]
  name: String,
  url: Option<String>,
}

#[derive(Deserialize)]
struct ArticleBody {
  html: Option<String>,
}

#[derive(Deserialize)]
struct Image {
  content_url: Option<String>,
}

#[derive(Deserialize)]
struct Article {
  #[serde(default)]
  name: String,
  #[serde(rename = "abstract")]
  summary: Option<String>,
  article_body: Option<ArticleBody>,
  url: Option<String>,
  in_language: Option<Named>,
  is_part_of: Option<Named>,
  date_modified: Option<String>,
  #[serde(default)]
  categories: Vec<Named>,
  #[serde(default)]
  has_parts: Vec<Named>,
  image: Option<Image>,
}

fn escape_html(value: &str) -> String {
  value
    .replace('&', "&amp;")
    .replace('<', "&lt;")
    .replace('>', "&gt;")
    .replace('"', "&quot;")
}

/// The article as a full HTML document, carrying its metadata in `<head>`.
fn article_document(article: &Article, body: &str, wiki: &WikimediaUrl, url: &str) -> String {
  let summary = escape_html(article.summary.as_deref().unwrap_or_default());
  let project = article
    .is_part_of
    .as_ref()
    .map_or("Wikipedia", |x| x.name.as_str());
  let language = article
    .in_language
    .as_ref()
    .map_or(wiki.lang.as_str(), |x| x.name.as_str());
  let image = match article
    .image
    .as_ref()
    .and_then(|x| x.content_url.as_deref())
  {
    Some(x) if !x.is_empty() => format!(
      "<meta property=\"og:image\" content=\"{}\">",
      escape_html(x)
    ),
    _ => String::new(),
  };
  let toc: String = article
    .has_parts
    .iter()
    .map(|x| format!("<li>{}</li>", x.name))
    .collect();
  let categories: String = article
    .categories
    .iter()
    .map(|x| {
      format!(
        "<li><a href=\"{}\">{}</a></li>",
        x.url.as_deref().unwrap_or_default(),
        x.name
      )
    })
    .collect();
  let toc = match toc.as_str() {
    "" => String::new(),
    _ => format!("<nav><h2>Table of Contents</h2><ul>{toc}</ul></nav>"),
  };
  let categories = match categories.as_str() {
    "" => String::new(),
    _ => format!("<footer><h2>Categories</h2><ul>{categories}</ul></footer>"),
  };
  let (lang, name) = (&wiki.lang, &article.name);
  format!(
    "<!DOCTYPE html>\n<html lang=\"{lang}\">\n<head>\n  <meta charset=\"utf-8\">\n  <title>{name} - {project}</title>\n  <meta name=\"description\" content=\"{summary}\">\n  <meta property=\"og:title\" content=\"{}\">\n  <meta property=\"og:description\" content=\"{summary}\">\n  <meta property=\"og:url\" content=\"{}\">\n  {image}\n  <meta name=\"article:modified_time\" content=\"{}\">\n  <meta name=\"language\" content=\"{language}\">\n</head>\n<body>\n  <article>\n    <h1>{}</h1>\n    {body}\n  </article>\n  {toc}\n  {categories}\n</body>\n</html>",
    escape_html(name),
    escape_html(url),
    article.date_modified.as_deref().unwrap_or_default(),
    escape_html(name),
  )
}

pub struct WikipediaEngine {
  username: &'static str,
  password: &'static str,
}

/// The Enterprise API's matches for an article title within one project.
async fn request_articles(
  client: &reqwest::Client,
  token: String,
  article_name: &str,
  wiki: &WikimediaUrl,
) -> Result<Vec<Article>, ScrapeURLError> {
  let response = client
    .post(format!(
      "{API_BASE}/articles/{}",
      utf8_percent_encode(article_name, URI_COMPONENT)
    ))
    .bearer_auth(token)
    .header("User-Agent", USER_AGENT)
    .header("Accept", "application/json")
    .json(&json!({
      "filters": [{ "field": "is_part_of.identifier", "value": wiki.project_identifier }],
      "limit": 1,
    }))
    .send()
    .await?;
  let status = response.status().as_u16();
  Span::current().record("http.status", status);
  match status {
    404 => Err(engine_error(format!(
      "Wikipedia article not found: {article_name} ({})",
      wiki.project_identifier
    ))),
    401 | 403 => {
      clear_cached_token().await;
      Err(engine_error(format!(
        "Wikipedia Enterprise API authorization failed ({status}). Check credentials."
      )))
    }
    _ if !response.status().is_success() => {
      let body = response.text().await.unwrap_or_default();
      Err(engine_error(format!(
        "Wikipedia Enterprise API error ({status}): {body}"
      )))
    }
    _ => Ok(response.json().await?),
  }
}

impl WikipediaEngine {
  async fn fetch_article(
    &self,
    meta: &Meta,
    limit: Duration,
  ) -> Result<RawPageResult, ScrapeURLError> {
    let url = meta.get_url();
    let wiki = parse_wikimedia_url(url)
      .ok_or_else(|| engine_error(format!("URL is not a supported Wikimedia URL: {url}")))?;
    let client = super::shared_client(&CLIENT)?;
    let article_name = resolve_redirect(client, &wiki, limit).await;
    let token = access_token(client, self.username, self.password).await?;
    let article = request_articles(client, token, &article_name, &wiki)
      .await?
      .into_iter()
      .next()
      .ok_or_else(|| {
        engine_error(format!(
          "No article data returned for: {article_name} ({})",
          wiki.project_identifier
        ))
      })?;
    let Some(body) = article
      .article_body
      .as_ref()
      .and_then(|x| x.html.as_deref())
      .filter(|x| !x.is_empty())
    else {
      return Err(engine_error(format!(
        "Wikipedia article has no HTML body: {article_name}"
      )));
    };
    let landed = article.url.clone().unwrap_or_else(|| url.to_string());
    Ok(RawPageResult {
      content: RawPageContent::ChromeRenderedDOM(article_document(&article, body, &wiki, &landed)),
      url: Url::parse(&landed).unwrap_or_else(|_| url.clone()),
      status_code: 200,
      screenshot: None,
      actions: None,
      cached_at: None,
      content_type: "text/html; charset=utf-8".to_string(),
      audio_cookies: Vec::new(),
      proxy_used: ScrapeProxy::Basic,
      timezone: None,
      filename: None,
      postprocessors_used: None,
    })
  }
}

impl Engine for WikipediaEngine {
  const NAME: &'static str = "wikipedia";
  const SPECIAL_REGEX: Option<&'static Regex> = None;
  const FEATURES: ConstFeatureFlags = ConstFeatureFlags::new(&[FeatureFlag::DisableAdblock]);

  async fn get() -> Option<EngineKind> {
    let (username, password) = CREDENTIALS.as_ref()?;
    Some(EngineKind::Wikipedia(Self { username, password }))
  }

  #[tracing::instrument(
    name = "WikipediaEngine::scrape",
    skip_all,
    fields(http.status = Empty),
    err
  )]
  async fn scrape(
    &self,
    meta: &Meta,
    _proxy: ScrapeProxy,
  ) -> Result<EngineOutcome<RawPageResult>, ScrapeURLError> {
    let limit = meta
      .remaining_ms()
      .map_or(TIME_LIMIT, |x| TIME_LIMIT.min(Duration::from_millis(x)));
    match tokio::time::timeout(limit, self.fetch_article(meta, limit)).await {
      Ok(result) => result.map(EngineOutcome::Scraped),
      Err(_) => Err(engine_error(format!(
        "no answer within {}ms",
        limit.as_millis()
      ))),
    }
  }
}
