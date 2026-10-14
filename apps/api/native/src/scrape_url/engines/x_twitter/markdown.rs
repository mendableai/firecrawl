//! The markdown a profile or post renders to, matching the TS output byte for byte.

use serde::Deserialize;
use url::Url;

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfilePost {
  pub text: String,
  pub url: Option<String>,
  pub created_at: Option<String>,
  pub likes: Option<f64>,
  pub retweets: Option<f64>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
  pub display_name: Option<String>,
  pub username: Option<String>,
  pub profile_pic_url: Option<String>,
  pub bio: Option<String>,
  pub followers: Option<f64>,
  pub account_verified: Option<bool>,
  pub url: Option<String>,
  pub latest_posts: Option<Vec<ProfilePost>>,
}

/// A post, a thread entry, or a comment; comments carry no retweets.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostItem {
  pub author_display_name: Option<String>,
  pub author_username: Option<String>,
  pub text: String,
  pub url: Option<String>,
  pub created_at: Option<String>,
  pub likes: Option<f64>,
  pub retweets: Option<f64>,
}

#[derive(Debug, Default, Deserialize)]
pub struct Post {
  #[serde(flatten)]
  pub item: PostItem,
  pub thread: Option<Vec<PostItem>>,
  pub comments: Option<Vec<PostItem>>,
}

pub fn strip_at(value: Option<&str>) -> Option<String> {
  let trimmed = value?.trim();
  let handle = trimmed.strip_prefix('@').unwrap_or(trimmed);
  (!handle.is_empty()).then(|| handle.to_string())
}

fn escape_block(value: &str) -> String {
  value
    .replace('&', "&amp;")
    .replace('<', "&lt;")
    .replace('>', "&gt;")
}

fn escape_inline(value: &str) -> String {
  let mut out = String::new();
  for c in escape_block(value).chars() {
    if "\\`*_{}[]()#+-.!|".contains(c) {
      out.push('\\');
    }
    out.push(c);
  }
  out
}

/// `Intl.NumberFormat("en-US")`: grouped thousands, at most three fraction digits.
fn format_number(value: f64) -> String {
  let rounded = format!("{:.3}", value.abs());
  let (integer, fraction) = rounded.split_once('.').unwrap_or((&rounded, ""));
  let mut grouped = String::new();
  for (i, c) in integer.chars().enumerate() {
    if i > 0 && (integer.len() - i) % 3 == 0 {
      grouped.push(',');
    }
    grouped.push(c);
  }
  let fraction = fraction.trim_end_matches('0');
  let sign = if value < 0.0 && rounded.bytes().any(|x| x.is_ascii_digit() && x != b'0') {
    "-"
  } else {
    ""
  };
  match fraction {
    "" => format!("{sign}{grouped}"),
    _ => format!("{sign}{grouped}.{fraction}"),
  }
}

fn sanitize_url(url: &str) -> Option<String> {
  let parsed = Url::parse(url).ok()?;
  matches!(parsed.scheme(), "http" | "https").then(|| parsed.as_str().replace(')', "%29"))
}

fn link(label: &str, url: &str) -> String {
  match sanitize_url(url) {
    Some(url) => format!("[{}]({url})", escape_inline(label)),
    None => escape_inline(label),
  }
}

fn image(alt: &str, url: &str) -> String {
  match sanitize_url(url) {
    Some(url) => format!("![{}]({url})", escape_inline(alt)),
    None => "Unknown".to_string(),
  }
}

fn blockquote(value: &str) -> String {
  let escaped = escape_block(value.trim());
  if escaped.is_empty() {
    return "> ".to_string();
  }
  escaped
    .split('\n')
    .map(|x| x.strip_suffix('\r').unwrap_or(x))
    .map(|x| {
      if x.trim().is_empty() {
        ">".to_string()
      } else {
        format!("> {x}")
      }
    })
    .collect::<Vec<_>>()
    .join("\n")
}

fn metrics(likes: Option<f64>, retweets: Option<f64>) -> Vec<String> {
  [("Likes", likes), ("Retweets", retweets)]
    .into_iter()
    .filter_map(|(name, x)| x.map(|x| format!("{name}: {}", format_number(x))))
    .collect()
}

/// Collapses runs of blank lines and ends with exactly one newline.
fn trim_markdown(lines: &[String]) -> String {
  let joined = lines.join("\n");
  let collapsed = regex::regex!(r"\n{3,}").replace_all(&joined, "\n\n");
  format!("{}\n", collapsed.trim())
}

/// Pushes the `Posted:`/`URL:` lines a post, thread entry or comment shares.
fn push_posted_and_url(lines: &mut Vec<String>, created_at: Option<&str>, url: Option<&str>) {
  if let Some(created_at) = created_at.filter(|x| !x.is_empty()) {
    lines.push(format!("Posted: {}", escape_inline(created_at)));
  }
  if let Some(url) = url.filter(|x| !x.is_empty()) {
    lines.push(format!("URL: {}", link(url, url)));
  }
}

pub fn profile_markdown(profile: Profile) -> String {
  let username = strip_at(profile.username.as_deref()).unwrap_or_else(|| "unknown".to_string());
  let display_name = match profile.display_name.as_deref().map(str::trim) {
    Some(x) if !x.is_empty() => x.to_string(),
    _ => format!("@{username}"),
  };
  let mut lines = vec![
    format!(
      "# {} (@{})",
      escape_inline(&display_name),
      escape_inline(&username)
    ),
    String::new(),
  ];
  if let Some(bio) = profile.bio.filter(|x| !x.is_empty()) {
    lines.extend([escape_block(&bio), String::new()]);
  }

  let followers = profile
    .followers
    .map_or("Unknown".to_string(), format_number);
  let verified = profile
    .account_verified
    .map_or("Unknown", |x| if x { "yes" } else { "no" });
  let picture = match profile.profile_pic_url.as_deref().filter(|x| !x.is_empty()) {
    Some(url) => image(&display_name, url),
    None => "Unknown".to_string(),
  };
  lines.push(format!("- Followers: {followers}"));
  lines.push(format!("- Verified: {verified}"));
  lines.push(format!("- Profile Picture: {picture}"));
  if let Some(url) = profile.url.filter(|x| !x.is_empty()) {
    lines.push(format!("- Source: {}", link(&url, &url)));
  }
  lines.extend([String::new(), "## Latest Posts".to_string(), String::new()]);

  let posts = profile.latest_posts.unwrap_or_default();
  if posts.is_empty() {
    lines.push("No recent top-level posts were returned.".to_string());
  }
  for (index, post) in posts.into_iter().take(5).enumerate() {
    lines.push(format!("### {}. Post", index + 1));
    push_posted_and_url(&mut lines, post.created_at.as_deref(), post.url.as_deref());
    lines.extend([String::new(), blockquote(&post.text)]);
    let metrics = metrics(post.likes, post.retweets);
    if !metrics.is_empty() {
      lines.extend([String::new(), metrics.join(" | ")]);
    }
    lines.push(String::new());
  }
  trim_markdown(&lines)
}

pub fn post_markdown(post: Post) -> String {
  let item = &post.item;
  let username = strip_at(item.author_username.as_deref());
  let title = match &username {
    Some(username) => format!("Post by @{}", escape_inline(username)),
    None => "X/Twitter Post".to_string(),
  };
  let mut lines = vec![format!("# {title}"), String::new()];

  let byline: Vec<String> = [
    item
      .author_display_name
      .as_deref()
      .filter(|x| !x.trim().is_empty())
      .map(escape_inline),
    username
      .as_deref()
      .map(|x| format!("@{}", escape_inline(x))),
  ]
  .into_iter()
  .flatten()
  .collect();
  if !byline.is_empty() {
    lines.push(format!("Author: {}", byline.join(" ")));
  }
  push_posted_and_url(&mut lines, item.created_at.as_deref(), item.url.as_deref());
  let metrics = metrics(item.likes, item.retweets);
  if !metrics.is_empty() {
    lines.push(metrics.join(" | "));
  }
  lines.extend([
    String::new(),
    "## Post".to_string(),
    String::new(),
    escape_block(item.text.trim()),
  ]);

  push_thread(&mut lines, post.thread.unwrap_or_default());
  push_comments(&mut lines, post.comments.unwrap_or_default());
  trim_markdown(&lines)
}

fn push_thread(lines: &mut Vec<String>, thread: Vec<PostItem>) {
  let thread: Vec<PostItem> = thread
    .into_iter()
    .filter(|x| !x.text.trim().is_empty())
    .collect();
  if thread.is_empty() {
    return;
  }
  lines.extend([String::new(), "## Thread".to_string(), String::new()]);
  for (index, item) in thread.iter().enumerate() {
    lines.push(format!("### {}. Thread Post", index + 1));
    if let Some(author) = strip_at(item.author_username.as_deref()) {
      lines.push(format!("Author: @{}", escape_inline(&author)));
    }
    push_posted_and_url(lines, item.created_at.as_deref(), item.url.as_deref());
    lines.extend([String::new(), blockquote(&item.text)]);
    let metrics = metrics(item.likes, item.retweets);
    if !metrics.is_empty() {
      lines.extend([String::new(), metrics.join(" | ")]);
    }
    lines.push(String::new());
  }
}

fn push_comments(lines: &mut Vec<String>, comments: Vec<PostItem>) {
  let comments: Vec<PostItem> = comments
    .into_iter()
    .filter(|x| !x.text.trim().is_empty())
    .take(5)
    .collect();
  lines.extend([String::new(), "## Top Comments".to_string(), String::new()]);
  if comments.is_empty() {
    lines.push("No top comments were returned.".to_string());
  }
  for (index, comment) in comments.iter().enumerate() {
    let heading = match strip_at(comment.author_username.as_deref()) {
      Some(author) => format!("@{}", escape_inline(&author)),
      None => "Comment".to_string(),
    };
    lines.push(format!("### {}. {heading}", index + 1));
    if let Some(name) = comment
      .author_display_name
      .as_deref()
      .filter(|x| !x.is_empty())
    {
      lines.push(format!("Author: {}", escape_inline(name)));
    }
    push_posted_and_url(lines, comment.created_at.as_deref(), comment.url.as_deref());
    lines.extend([String::new(), blockquote(&comment.text)]);
    if let Some(likes) = comment.likes {
      lines.extend([String::new(), format!("Likes: {}", format_number(likes))]);
    }
    lines.push(String::new());
  }
}
