//! X/Twitter profiles and posts, fetched through Grok's `x_search` tool and rendered as markdown.

use std::sync::LazyLock;

use ::url::Url;
use regex::Regex;
use serde_json::json;
use tracing::{Span, field::Empty};

use self::{
  grok::{GrokCall, grok},
  markdown::{Post, Profile, post_markdown, profile_markdown, strip_at},
  schema::{post_schema, profile_schema},
};
use super::super::{
  error::ScrapeURLError,
  feature_flags::{ConstFeatureFlags, FeatureFlag},
  meta::Meta,
  raw_page::{RawPageContent, RawPageResult, ScrapeProxy},
};
use super::{Engine, EngineKind, EngineOutcome};

mod grok;
mod markdown;
mod schema;
mod url;

use self::url::XTwitterUrl;
pub use self::url::parse_x_twitter_url;

static XAI_API_KEY: LazyLock<Option<String>> =
  LazyLock::new(|| std::env::var("XAI_API_KEY").ok().filter(|x| !x.is_empty()));

/// Without a key the engine still claims X URLs on the hosted service, so the scrape fails
/// with a configuration error instead of reaching another engine.
fn available() -> bool {
  XAI_API_KEY.is_some() || std::env::var("USE_DB_AUTHENTICATION").as_deref() == Ok("true")
}

pub struct XTwitterEngine {
  api_key: Option<&'static str>,
}

async fn fetch_profile(
  meta: &Meta,
  api_key: &str,
  handle: &str,
) -> Result<Profile, ScrapeURLError> {
  let profile: Profile = grok(meta, api_key, GrokCall {
    method: "xTwitter/profile",
    prompt: format!(
      "Give me current public X/Twitter profile details for @{handle}: display name, username, profile picture URL, bio, follower count, verification status, and profile URL. Look up this exact username directly with a single user search for \"{handle}\" that returns only 1 result; do not search for other or similarly named accounts. If no account has the username {handle} (ignoring case), return null for every profile field and no posts rather than another account's data. Also return exactly the 5 latest posts authored by @{handle} that are top-level posts, not replies or comments, found with a single latest-posts search for \"from:{handle} -filter:replies\" limited to 5 results. Include fewer posts only if fewer public non-reply posts are available. Use the current public X data available to x_search."
    ),
    tool: json!({ "type": "x_search" }),
    output_name: "x_twitter_profile",
    output_description: "Current public X/Twitter profile data and latest top-level posts.",
    schema: profile_schema(),
  })
  .await?;

  // A user search can surface a similarly named account; never pass it off as the requested one.
  let matches = strip_at(profile.username.as_deref()).map(|x| x.eq_ignore_ascii_case(handle));
  Span::current().record("x_twitter.profile_match", matches);
  Ok(if matches == Some(true) {
    profile
  } else {
    Profile::default()
  })
}

async fn fetch_post(
  meta: &Meta,
  api_key: &str,
  handle: Option<&str>,
  post_id: &str,
  normalized_url: &str,
) -> Result<Post, ScrapeURLError> {
  let by = handle.map(|x| format!(" by @{x}")).unwrap_or_default();
  let mut tool = json!({
    "type": "x_search",
    "enable_image_understanding": true,
    "enable_video_understanding": true,
  });
  if let Some(handle) = handle {
    tool["allowed_x_handles"] = json!([handle]);
  }
  grok(meta, api_key, GrokCall {
    method: "xTwitter/post",
    prompt: format!(
      "Fetch the public X/Twitter post{by} with post id {post_id} at {normalized_url}. Return the post body in text as GitHub-flavored Markdown, preserving its original structure like headings and lists. Also return author, URL, created date, likes, and retweets. If this post is part of a thread, return the unrolled thread in chronological order under thread. Return the top 5 public comments or replies to the post under comments. Use the current public X data available to x_search."
    ),
    tool,
    output_name: "x_twitter_post",
    output_description: "Current public X/Twitter post data with metrics, thread, and top comments.",
    schema: post_schema(),
  })
  .await
}

impl Engine for XTwitterEngine {
  const NAME: &'static str = "x-twitter";
  const SPECIAL_REGEX: Option<&'static Regex> = None;
  const FEATURES: ConstFeatureFlags = ConstFeatureFlags::new(&[FeatureFlag::DisableAdblock]);

  async fn get() -> Option<EngineKind> {
    available().then(|| {
      EngineKind::XTwitter(Self {
        api_key: XAI_API_KEY.as_deref(),
      })
    })
  }

  #[tracing::instrument(
    name = "XTwitterEngine::scrape",
    skip_all,
    fields(x_twitter.kind = Empty, x_twitter.profile_match = Empty),
    err
  )]
  async fn scrape(
    &self,
    meta: &Meta,
    _proxy: ScrapeProxy,
  ) -> Result<EngineOutcome<RawPageResult>, ScrapeURLError> {
    let Some(x_url) = parse_x_twitter_url(meta.get_url()) else {
      return Err(ScrapeURLError::UnclassifiedEngineError {
        engine: Self::NAME,
        error: format!("URL is not a supported X/Twitter URL: {}", meta.get_url()),
      });
    };
    let Some(api_key) = self.api_key else {
      return Err(ScrapeURLError::XTwitterConfigurationError);
    };
    Span::current().record("x_twitter.kind", x_url.kind());

    let markdown = match &x_url {
      XTwitterUrl::Profile { handle, .. } => {
        profile_markdown(fetch_profile(meta, api_key, handle).await?)
      }
      XTwitterUrl::Post {
        handle,
        post_id,
        normalized_url,
      } => {
        post_markdown(fetch_post(meta, api_key, handle.as_deref(), post_id, normalized_url).await?)
      }
    };

    Ok(EngineOutcome::Scraped(RawPageResult {
      url: Url::parse(x_url.normalized_url())?,
      status_code: 200,
      content: RawPageContent::GeneratedMarkdown(markdown),
      screenshot: None,
      actions: None,
      cached_at: None,
      content_type: "text/html; charset=utf-8".to_string(),
      audio_cookies: Vec::new(),
      proxy_used: ScrapeProxy::Basic,
      timezone: None,
      filename: None,
      postprocessors_used: Some(vec![Self::NAME.to_string()]),
    }))
  }
}
