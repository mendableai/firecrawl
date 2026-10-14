//! TS `pipeline/anchor.ts`: locate each snippet the anchor picker chose in the
//! raw HTML, climb to a budgeted subtree, simplify it and stitch the windows
//! together with verified selectors. Falls back to simplifying the whole page.

use std::{
  collections::HashSet,
  sync::{Arc, LazyLock},
};

use kuchikiki::NodeRef;
use regex::Regex;
use tracing::{Span, field::Empty, instrument};

use super::super::super::cost_tracking::CostTracking;
use super::{
  config::{
    ANCHOR_MAX_BLOCKS, ANCHOR_MAX_PARENTS, ANCHOR_PER_BLOCK_BUDGET, ANCHOR_TOTAL_BUDGET,
    HTML_BUDGET,
  },
  dom, js, llm, prompts,
  simplify::simplify_html,
  unique_selector::unique_selector,
};

pub struct AnchorArgs<'a> {
  pub html: &'a str,
  pub markdown_preview: &'a str,
  pub schema_json: &'a str,
  pub prompt: &'a str,
}

/// TS `buildAnchorContext`.
#[instrument(
  name = "deterministic_json::build_anchor_context",
  skip_all,
  fields(snippets = Empty, blocks = Empty, verified_selectors = Empty, whole_page = Empty)
)]
pub async fn build_anchor_context(
  args: &AnchorArgs<'_>,
  cost_tracking: &Arc<CostTracking>,
) -> String {
  let messages =
    prompts::anchor_picker_messages(args.prompt, args.schema_json, args.markdown_preview);
  let snippets = llm::pick_snippets(messages, cost_tracking)
    .await
    .unwrap_or_default();
  let span = Span::current();
  span.record("snippets", snippets.len());

  let built = match snippets.is_empty() {
    true => String::new(),
    false => build_anchor_html(args.html, &snippets),
  };
  let whole_page = js::trim(&built).is_empty();
  span.record("whole_page", whole_page);
  match whole_page {
    true => simplify_html(args.html, HTML_BUDGET),
    false => built,
  }
}

static LIST_MARKER: LazyLock<Regex> = LazyLock::new(|| {
  let s = js::SPACE_CLASS;
  Regex::new(&format!(r"^{s}*(?:[-*+]{s}+|[0-9]+\.{s}+|>{s}+|#+{s}+)")).expect("static regex")
});
static BOLD: LazyLock<Regex> =
  LazyLock::new(|| Regex::new(r"\*\*([^*]+)\*\*").expect("static regex"));
static UNDERLINE_BOLD: LazyLock<Regex> =
  LazyLock::new(|| Regex::new("__([^_]+)__").expect("static regex"));
static ITALIC: LazyLock<fancy_regex::Regex> =
  LazyLock::new(|| fancy_regex::Regex::new(r"(?<!\*)\*([^*\n]+)\*(?!\*)").expect("static regex"));
static CODE: LazyLock<Regex> = LazyLock::new(|| Regex::new("`([^`]+)`").expect("static regex"));
static LINK: LazyLock<Regex> =
  LazyLock::new(|| Regex::new(r"!?\[([^\]]+)\]\([^)]*\)").expect("static regex"));
static BODY_OPEN: LazyLock<Regex> =
  LazyLock::new(|| Regex::new("(?i)<body[^>]*>").expect("static regex"));

/// Strips the markdown decoration the picker copies from the markdown.
fn strip_markdown(s: &str) -> String {
  let s = LIST_MARKER.replace(s, "");
  let s = BOLD.replace_all(&s, "${1}");
  let s = UNDERLINE_BOLD.replace_all(&s, "${1}");
  let s = ITALIC.replace_all(&s, "${1}");
  let s = CODE.replace_all(&s, "${1}");
  let s = LINK.replace_all(&s, "${1}");
  js::trim(&s).to_string()
}

fn normalized_text(node: &NodeRef) -> String {
  js::collapse_space(&dom::text_content(node))
}

/// The last deepest element whose normalized text contains the needle.
fn find_deepest_match(root: &NodeRef, needle: &str) -> Option<NodeRef> {
  if !normalized_text(root).contains(needle) {
    return None;
  }
  let mut best = None;
  let mut stack = vec![root.clone()];
  while let Some(node) = stack.pop() {
    let matching: Vec<NodeRef> = dom::element_children(&node)
      .into_iter()
      .filter(|child| normalized_text(child).contains(needle))
      .collect();
    if matching.is_empty() {
      best = Some(node);
    }
    stack.extend(matching.into_iter().rev());
  }
  best
}

fn own_text(node: &NodeRef) -> String {
  let mut out = String::new();
  for child in node.children() {
    if child.as_text().is_none() {
      out.push(' ');
    }
    out.push_str(&dom::text_content(&child));
  }
  out
}

/// How many non-nested elements own text containing the needle.
fn count_matches(root: &NodeRef, needle: &str) -> usize {
  let matches: Vec<NodeRef> = root
    .descendants()
    .filter(|x| x.as_element().is_some() && js::collapse_space(&own_text(x)).contains(needle))
    .collect();
  let set: HashSet<*const kuchikiki::Node> = matches.iter().map(|x| &*x.0 as *const _).collect();
  matches
    .iter()
    .filter(|x| !x.ancestors().any(|a| set.contains(&(&*a.0 as *const _))))
    .count()
}

fn climb_to_budget(anchor: &NodeRef) -> NodeRef {
  let mut current = anchor.clone();
  for _ in 0..ANCHOR_MAX_PARENTS {
    let Some(parent) = dom::parent_element(&current) else {
      break;
    };
    let tag = parent.as_element().map(dom::tag_name).unwrap_or_default();
    if tag == "BODY"
      || tag == "HTML"
      || js::len(&dom::outer_html(&parent)) > ANCHOR_PER_BLOCK_BUDGET
    {
      break;
    }
    current = parent;
  }
  current
}

fn anchors_header(hints: &[(String, String)]) -> String {
  if hints.is_empty() {
    return String::new();
  }
  let lines: Vec<String> = hints
    .iter()
    .map(|(snippet, selector)| format!("  {} -> {selector}", js::quote(snippet)))
    .collect();
  format!(
    "<!-- VERIFIED SELECTORS: each returns exactly one element on the full page.\n     Your code runs against the whole document, so prefer these for the\n     fields they name. -->\n{}\n\n",
    lines.join("\n")
  )
}

/// simplifyHtml serializes a whole `<html>` shell; keep only the body contents.
fn unwrap_body(html: &str) -> &str {
  let Some(open) = BODY_OPEN.find(html) else {
    return html;
  };
  match html.rfind("</body>") {
    Some(end) if end >= open.end() => &html[open.end()..end],
    _ => &html[open.end()..],
  }
}

/// TS `buildAnchorHtml`.
fn build_anchor_html(raw_html: &str, snippets: &[String]) -> String {
  let doc = dom::parse_document(raw_html);
  let Some(root) = dom::body(&doc).or_else(|| dom::document_element(&doc)) else {
    return String::new();
  };

  let mut emitted: Vec<NodeRef> = Vec::new();
  let mut seen_html: HashSet<String> = HashSet::new();
  let mut hints: Vec<(String, String)> = Vec::new();
  let mut combined = String::new();
  let mut blocks = 0;

  for raw in snippets {
    let snippet = js::collapse_space(&strip_markdown(raw));
    if snippet.is_empty() {
      continue;
    }
    let Some(anchor) = find_deepest_match(&root, &snippet) else {
      continue;
    };
    if let Some(selector) = unique_selector(&doc, &anchor) {
      hints.push((js::prefix(&snippet, 80).to_string(), selector));
    }
    if emitted.iter().any(|prior| dom::contains(prior, &anchor)) || blocks >= ANCHOR_MAX_BLOCKS {
      continue;
    }

    let subtree = climb_to_budget(&anchor);
    let simplified = simplify_html(&dom::outer_html(&subtree), ANCHOR_PER_BLOCK_BUDGET);
    let simplified = js::trim(unwrap_body(&simplified)).to_string();
    if simplified.is_empty() || seen_html.contains(&simplified) {
      continue;
    }

    let matches = count_matches(&root, &snippet);
    let note = match matches > 1 {
      true => format!(" ({matches} similar matches on the page)"),
      false => String::new(),
    };
    let piece = format!(
      "<!-- anchor {}: {}{note} -->\n{simplified}\n",
      blocks + 1,
      js::quote(js::prefix(&snippet, 120))
    );
    if js::len(&combined) + js::len(&piece) > ANCHOR_TOTAL_BUDGET && blocks > 0 {
      break;
    }
    emitted.push(subtree);
    seen_html.insert(simplified);
    combined += &piece;
    blocks += 1;
  }

  let span = Span::current();
  span.record("blocks", blocks);
  span.record("verified_selectors", hints.len());
  match combined.is_empty() {
    true => String::new(),
    false => anchors_header(&hints) + &combined,
  }
}
