//! Which X/Twitter URLs the engine serves: a profile or a post.

use std::sync::LazyLock;

use url::Url;

/// First path segments that are X routes, not handles. `/tos` and `/privacy` are
/// missing, as they are on the TS side.
const RESERVED_PROFILE_PATHS: [&str; 13] = [
  "compose",
  "explore",
  "hashtag",
  "home",
  "i",
  "intent",
  "login",
  "logout",
  "messages",
  "notifications",
  "search",
  "settings",
  "share",
];

/// JavaScript RegExp source matching the URLs `parse_x_twitter_url` accepts. It takes no
/// flags, so the reserved paths spell out both letter cases.
pub static X_TWITTER_URL_PATTERN: LazyLock<String> = LazyLock::new(|| {
  let reserved = RESERVED_PROFILE_PATHS
    .iter()
    .map(|path| {
      path
        .chars()
        .map(|x| format!("[{x}{}]", x.to_ascii_uppercase()))
        .collect::<String>()
    })
    .collect::<Vec<_>>()
    .join("|");
  format!(
    r"^https?://(?:www\.)?(?:x\.com|(?:mobile\.)?twitter\.com)(?::\d+)?/+(?:i/+web/+status/+\d{{5,}}(?:[/?#]|$)|[A-Za-z0-9_]{{1,15}}/+status(?:es)?/+\d{{5,}}(?:[/?#]|$)|(?!(?:{reserved})/*(?:[?#]|$))[A-Za-z0-9_]{{1,15}}/*(?:[?#]|$))"
  )
});

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum XTwitterUrl {
  Profile {
    handle: String,
    normalized_url: String,
  },
  Post {
    handle: Option<String>,
    post_id: String,
    normalized_url: String,
  },
}

impl XTwitterUrl {
  pub fn kind(&self) -> &'static str {
    match self {
      Self::Profile { .. } => "profile",
      Self::Post { .. } => "post",
    }
  }

  pub fn normalized_url(&self) -> &str {
    match self {
      Self::Profile { normalized_url, .. } | Self::Post { normalized_url, .. } => normalized_url,
    }
  }
}

fn is_handle(value: &str) -> bool {
  (1..=15).contains(&value.len())
    && value
      .bytes()
      .all(|x| x.is_ascii_alphanumeric() || x == b'_')
}

fn is_post_id(value: &str) -> bool {
  value.len() >= 5 && value.bytes().all(|x| x.is_ascii_digit())
}

fn post(handle: Option<&str>, post_id: &str) -> XTwitterUrl {
  let normalized_url = match handle {
    Some(handle) => format!("https://x.com/{handle}/status/{post_id}"),
    None => format!("https://x.com/i/web/status/{post_id}"),
  };
  XTwitterUrl::Post {
    handle: handle.map(str::to_string),
    post_id: post_id.to_string(),
    normalized_url,
  }
}

/// A profile (`x.com/<handle>`) or a post (`x.com/<handle>/status/<id>`,
/// `x.com/i/web/status/<id>`, `x.com/i/status/<id>`) on x.com or twitter.com.
pub fn parse_x_twitter_url(url: &Url) -> Option<XTwitterUrl> {
  if !matches!(url.scheme(), "http" | "https") {
    return None;
  }
  let host = url.host_str()?.to_ascii_lowercase();
  let host = host.strip_prefix("www.").unwrap_or(&host);
  if !matches!(host, "x.com" | "twitter.com" | "mobile.twitter.com") {
    return None;
  }

  let segments: Vec<&str> = url
    .path()
    .split('/')
    .map(str::trim)
    .filter(|x| !x.is_empty())
    .collect();
  match segments.as_slice() {
    ["i", "web", "status", id, ..] if is_post_id(id) => Some(post(None, id)),
    ["i", "status", id, ..] if is_post_id(id) => Some(post(None, id)),
    [handle, "status" | "statuses", id, ..] if is_handle(handle) && is_post_id(id) => {
      Some(post(Some(handle), id))
    }
    [handle]
      if is_handle(handle)
        && !RESERVED_PROFILE_PATHS.contains(&handle.to_ascii_lowercase().as_str()) =>
    {
      Some(XTwitterUrl::Profile {
        handle: handle.to_string(),
        normalized_url: format!("https://x.com/{handle}"),
      })
    }
    _ => None,
  }
}
