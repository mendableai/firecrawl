//! Which Wikimedia URLs the Enterprise API serves, and the article title they name.

use std::{sync::LazyLock, time::Duration};

use percent_encoding::percent_decode_str;
use serde::Deserialize;
use tracing::{Span, field::Empty};
use url::Url;

/// Wikimedia project domains and their Enterprise API identifier suffixes.
const PROJECTS: [(&str, &str); 7] = [
  ("wikipedia.org", "wiki"),
  ("wiktionary.org", "wiktionary"),
  ("wikisource.org", "wikisource"),
  ("wikibooks.org", "wikibooks"),
  ("wikiquote.org", "wikiquote"),
  ("wikiversity.org", "wikiversity"),
  ("wikivoyage.org", "wikivoyage"),
];

/// JavaScript RegExp source matching the URLs `parse_wikimedia_url` accepts.
pub static WIKIMEDIA_URL_PATTERN: LazyLock<String> = LazyLock::new(|| {
  let domains = PROJECTS
    .iter()
    .map(|(domain, _)| domain.replace('.', r"\."))
    .collect::<Vec<_>>()
    .join("|");
  format!(r"^[a-z][a-z0-9+.-]*://(?!www\.)[a-z]{{2,3}}\.(?:{domains})(?::\d+)?/wiki/[^?#]")
});

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WikimediaUrl {
  pub article_name: String,
  pub lang: String,
  pub domain: &'static str,
  /// e.g. `enwiki` for en.wikipedia.org.
  pub project_identifier: String,
}

/// An article on a language edition of a Wikimedia project, like `en.wikipedia.org/wiki/<title>`.
/// `www.` is the project portal, which redirects to a language edition.
/// Undecodable bytes in the title don't disown the URL, as `WIKIMEDIA_URL_PATTERN` can't tell.
pub fn parse_wikimedia_url(url: &Url) -> Option<WikimediaUrl> {
  let (lang, domain) = url.host_str()?.split_once('.')?;
  let (domain, suffix) = PROJECTS.into_iter().find(|(x, _)| *x == domain)?;
  if !(2..=3).contains(&lang.len())
    || !lang.bytes().all(|x| x.is_ascii_lowercase())
    || lang == "www"
  {
    return None;
  }
  let article = url
    .path()
    .strip_prefix("/wiki/")
    .filter(|x| !x.is_empty())?;
  Some(WikimediaUrl {
    article_name: percent_decode_str(article)
      .decode_utf8_lossy()
      .replace(' ', "_"),
    lang: lang.to_string(),
    domain,
    project_identifier: format!("{lang}{suffix}"),
  })
}

#[derive(Deserialize)]
struct Mapping {
  to: String,
}

#[derive(Deserialize, Default)]
struct Query {
  #[serde(default)]
  redirects: Vec<Mapping>,
  #[serde(default)]
  normalized: Vec<Mapping>,
}

#[derive(Deserialize)]
struct QueryResponse {
  #[serde(default)]
  query: Query,
}

/// The article a title redirects to (`UK` to `United_Kingdom`), through the free MediaWiki
/// API. Any failure keeps the title as it is.
#[tracing::instrument(
  name = "WikipediaEngine::resolve_redirect",
  skip_all,
  fields(wikipedia.redirect = Empty, http.status = Empty)
)]
pub async fn resolve_redirect(
  client: &reqwest::Client,
  wiki: &WikimediaUrl,
  timeout: Duration,
) -> String {
  let span = Span::current();
  let mut api = format!("https://{}.{}/w/api.php", wiki.lang, wiki.domain);
  api.push('?');
  api.push_str(
    &url::form_urlencoded::Serializer::new(String::new())
      .append_pair("action", "query")
      .append_pair("titles", &wiki.article_name)
      .append_pair("redirects", "1")
      .append_pair("format", "json")
      .append_pair("formatversion", "2")
      .finish(),
  );
  let response = client
    .get(api)
    .header("User-Agent", super::USER_AGENT)
    .header("Accept", "application/json")
    .timeout(timeout)
    .send()
    .await;
  let query = match response {
    Ok(response) if response.status().is_success() => {
      span.record("http.status", response.status().as_u16());
      response.json::<QueryResponse>().await.map(|x| x.query)
    }
    Ok(response) => {
      span.record("http.status", response.status().as_u16());
      span.record("wikipedia.redirect", "unavailable");
      return wiki.article_name.clone();
    }
    Err(error) => Err(error),
  };
  let query = match query {
    Ok(query) => query,
    Err(error) => {
      span.record("wikipedia.redirect", "failed");
      span.in_scope(|| tracing::error!(error = %error));
      return wiki.article_name.clone();
    }
  };
  let (outcome, title) = match (query.redirects.last(), query.normalized.last()) {
    (Some(redirect), _) => ("resolved", redirect.to.replace(' ', "_")),
    (None, Some(normalized)) => ("normalized", normalized.to.replace(' ', "_")),
    (None, None) => ("unchanged", wiki.article_name.clone()),
  };
  span.record("wikipedia.redirect", outcome);
  title
}
