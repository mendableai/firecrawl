//! TS `html/simplify.ts`: shrink raw HTML into a compact, selector-faithful
//! sample for the codegen model. Traversals are iterative so deeply nested
//! pages can't overflow the stack.

use std::{collections::HashMap, sync::LazyLock};

use kuchikiki::{ElementData, NodeData, NodeRef, iter::NodeEdge};
use regex::Regex;
use url::Url;

use super::{dom, js};

const MAX_TEXT_LEN: usize = 160;
const MAX_ATTR_LEN: usize = 96;
const MAX_CLASS_NAMES: usize = 12;
const KEEP_REPEATS: usize = 3;
const MAX_JSON_LD_LEN: usize = 4_000;

const REMOVE_TAGS: &[&str] = &[
  "STYLE", "NOSCRIPT", "TEMPLATE", "LINK", "BR", "WBR", "SOURCE", "IFRAME",
];
const EMPTY_TAGS: &[&str] = &["SVG", "MATH", "CANVAS"];
const DROP_ATTRS: &[&str] = &[
  "style",
  "integrity",
  "nonce",
  "crossorigin",
  "referrerpolicy",
  "decoding",
  "loading",
  "fetchpriority",
  "sizes",
  "autocomplete",
  "spellcheck",
  "tabindex",
];
const URL_ATTRS: &[&str] = &["href", "src", "data-src", "poster", "action"];
const TRUNCATE_ATTRS: &[&str] = &[
  "src",
  "href",
  "srcset",
  "data-src",
  "poster",
  "action",
  "content",
  "value",
  "alt",
  "title",
  "aria-label",
];
const KEEP_META: &[&str] = &[
  "title",
  "description",
  "author",
  "date",
  "pubdate",
  "article:published_time",
];

static FRAMEWORK_ATTR: LazyLock<Regex> = LazyLock::new(|| {
  Regex::new(
    "^data-(react|next|astro|svelte|vue|emotion|styled|gtm|ga|analytics|tracking|cookie|consent)",
  )
  .expect("static regex")
});
// Matched against the ASCII-lowercased style, like JS's non-unicode /i.
static HIDDEN_STYLE: LazyLock<Regex> = LazyLock::new(|| {
  let s = js::SPACE_CLASS;
  Regex::new(&format!("display{s}*:{s}*none|visibility{s}*:{s}*hidden")).expect("static regex")
});
static SPACE_BETWEEN_TAGS: LazyLock<Regex> =
  LazyLock::new(|| Regex::new(&format!(">{}+<", js::SPACE_CLASS)).expect("static regex"));

/// TS `simplifyHtml`.
pub fn simplify_html(html: &str, max_total_len: usize) -> String {
  let doc = dom::parse_document(html);
  prune_head(&doc);
  let Some(root) = dom::document_element(&doc) else {
    return String::new();
  };
  walk(&root);
  flatten_wrappers(&root);
  let out = dom::outer_html(&root);
  clip_middle(&SPACE_BETWEEN_TAGS.replace_all(&out, "><"), max_total_len)
}

pub fn truncate(s: &str, max: usize) -> String {
  let len = js::len(s);
  match len <= max {
    true => s.to_string(),
    false => format!("{}...[+{}]", js::prefix(s, max), len - max),
  }
}

/// Keeps a URL's origin and first path segment instead of cutting it blindly.
fn truncate_url(value: &str, max: usize) -> String {
  let len = js::len(value);
  if len <= max {
    return value.to_string();
  }
  if let Some(head) = url_head(value)
    && js::len(&head) < max
  {
    return format!("{head}/...[+{}]", len - js::len(&head));
  }
  truncate(value, max)
}

fn url_head(value: &str) -> Option<String> {
  let url = Url::parse("https://x.invalid").ok()?.join(value).ok()?;
  let origin = url.origin().ascii_serialization();
  let origin = if origin == "https://x.invalid" {
    ""
  } else {
    &origin
  };
  let segment = url.path().split('/').find(|x| !x.is_empty()).unwrap_or("");
  Some(format!("{origin}/{segment}"))
}

pub fn is_json_ld(el: &ElementData) -> bool {
  dom::tag_name(el) == "SCRIPT"
    && dom::get_attribute(el, "type")
      .unwrap_or_default()
      .to_lowercase()
      == "application/ld+json"
}

fn is_hidden(el: &ElementData) -> bool {
  if dom::get_attribute(el, "hidden").is_some()
    || dom::get_attribute(el, "aria-hidden").as_deref() == Some("true")
  {
    return true;
  }
  if dom::tag_name(el) == "INPUT"
    && dom::get_attribute(el, "type")
      .unwrap_or_default()
      .to_lowercase()
      == "hidden"
  {
    return true;
  }
  HIDDEN_STYLE.is_match(
    &dom::get_attribute(el, "style")
      .unwrap_or_default()
      .to_ascii_lowercase(),
  )
}

fn prune_head(doc: &NodeRef) {
  let Some(head) = doc
    .descendants()
    .find(|x| x.as_element().is_some_and(|el| dom::is_html(el, "head")))
  else {
    return;
  };
  for child in dom::element_children(&head) {
    let Some(el) = child.as_element() else {
      continue;
    };
    let tag = dom::tag_name(el);
    if tag == "TITLE" || is_json_ld(el) {
      continue;
    }
    if tag == "META" {
      let key = dom::get_attribute(el, "name")
        .or_else(|| dom::get_attribute(el, "property"))
        .unwrap_or_default()
        .to_lowercase();
      if KEEP_META.contains(&key.as_str()) || key.starts_with("og:") || key.starts_with("twitter:")
      {
        continue;
      }
    }
    child.detach();
  }
}

fn clean_attributes(el: &ElementData) {
  for name in dom::attribute_names(el) {
    let lower = name.to_lowercase();
    if DROP_ATTRS.contains(&lower.as_str())
      || lower.starts_with("on")
      || FRAMEWORK_ATTR.is_match(&lower)
    {
      dom::remove_attribute(el, &name);
      continue;
    }
    let value = dom::get_attribute(el, &name).unwrap_or_default();
    if lower == "class" {
      let mut classes: Vec<&str> = Vec::new();
      for class in value.split(js::is_space).filter(|x| !x.is_empty()) {
        if !classes.contains(&class) {
          classes.push(class);
        }
      }
      classes.truncate(MAX_CLASS_NAMES);
      match classes.is_empty() {
        true => dom::remove_attribute(el, &name),
        false => dom::set_existing_attribute(el, &name, classes.join(" ")),
      }
    } else if value.starts_with("data:") {
      dom::set_existing_attribute(el, &name, "data:...".to_string());
    } else if URL_ATTRS.contains(&lower.as_str()) {
      dom::set_existing_attribute(el, &name, truncate_url(&value, MAX_ATTR_LEN));
    } else if TRUNCATE_ATTRS.contains(&lower.as_str()) {
      dom::set_existing_attribute(el, &name, truncate(&value, MAX_ATTR_LEN));
    }
  }
}

/// "Same kind of element": tag, sorted classes and the first child tags.
fn shape_key(node: &NodeRef, el: &ElementData) -> String {
  let class = dom::get_attribute(el, "class").unwrap_or_default();
  let mut classes: Vec<&str> = class
    .split(js::is_space)
    .filter(|x| !x.is_empty())
    .collect();
  classes.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
  let child_tags: Vec<String> = dom::element_children(node)
    .iter()
    .take(5)
    .filter_map(|x| x.as_element().map(dom::tag_name))
    .collect();
  format!(
    "{}|{}|{}",
    dom::tag_name(el),
    classes.join("."),
    child_tags.join(",")
  )
}

/// Collapses long runs of same-shaped children into a comment.
fn collapse_repeats(parent: &NodeRef) {
  let mut index: HashMap<String, usize> = HashMap::new();
  let mut groups: Vec<Vec<NodeRef>> = Vec::new();
  for child in dom::element_children(parent) {
    let Some(el) = child.as_element() else {
      continue;
    };
    let key = shape_key(&child, el);
    let slot = *index.entry(key).or_insert_with(|| {
      groups.push(Vec::new());
      groups.len() - 1
    });
    groups[slot].push(child);
  }
  for group in groups {
    if group.len() < 5.max(KEEP_REPEATS + 1) {
      continue;
    }
    let extra = &group[KEEP_REPEATS..];
    let tag = group[0]
      .as_element()
      .map(|el| dom::tag_name(el).to_lowercase())
      .unwrap_or_default();
    extra[0].insert_before(NodeRef::new_comment(format!(
      " {} more <{tag}> with the same shape ",
      extra.len()
    )));
    for el in extra {
      el.detach();
    }
  }
}

/// TS `walk`: cleans `node`'s children, then descends, then collapses repeats
/// bottom-up.
fn walk(root: &NodeRef) {
  let mut stack = vec![(root.clone(), false)];
  while let Some((node, children_done)) = stack.pop() {
    if children_done {
      collapse_repeats(&node);
      continue;
    }
    stack.push((node.clone(), true));
    let descend = clean_children(&node);
    stack.extend(descend.into_iter().rev().map(|x| (x, false)));
  }
}

/// One level of TS `walk`. Returns the children to walk into.
fn clean_children(node: &NodeRef) -> Vec<NodeRef> {
  let mut descend = Vec::new();
  for child in node.children().collect::<Vec<_>>() {
    match child.data() {
      NodeData::Text(text) => {
        let collapsed = js::collapse_space(&text.borrow());
        match collapsed.is_empty() {
          true => child.detach(),
          false => *text.borrow_mut() = truncate(&collapsed, MAX_TEXT_LEN),
        }
      }
      NodeData::Element(el) => {
        let tag = dom::tag_name(el);
        if is_hidden(el) || REMOVE_TAGS.contains(&tag.as_str()) {
          child.detach();
        } else if tag == "SCRIPT" {
          match is_json_ld(el) {
            true => {
              let text = js::collapse_space(&dom::text_content(&child));
              dom::set_text_content(&child, &truncate(&text, MAX_JSON_LD_LEN));
            }
            false => child.detach(),
          }
        } else if EMPTY_TAGS.contains(&tag.as_str()) {
          clean_attributes(el);
          dom::set_text_content(&child, "");
        } else {
          clean_attributes(el);
          descend.push(child.clone());
        }
      }
      _ => child.detach(),
    }
  }
  descend
}

/// Drops attribute-less `<div>`/`<span>` wrappers around a single element.
fn flatten_wrappers(root: &NodeRef) {
  let post_order: Vec<NodeRef> = root
    .traverse_inclusive()
    .filter_map(|edge| match edge {
      NodeEdge::End(node) if node.as_element().is_some() => Some(node),
      _ => None,
    })
    .collect();
  for node in post_order {
    let Some(el) = node.as_element() else {
      continue;
    };
    let tag = dom::tag_name(el);
    if (tag != "DIV" && tag != "SPAN") || !dom::attribute_names(el).is_empty() {
      continue;
    }
    let children = dom::element_children(&node);
    let has_own_text = node.children().any(|x| {
      x.as_text()
        .is_some_and(|t| !js::trim(&t.borrow()).is_empty())
    });
    if let [only] = children.as_slice()
      && !has_own_text
    {
      node.insert_before(only.clone());
      node.detach();
    }
  }
}

fn clip_middle(text: &str, max: usize) -> String {
  let len = js::len(text);
  if len <= max {
    return text.to_string();
  }
  let marker = format!("\n<!-- ...{} chars trimmed... -->\n", len - max);
  let room = max.saturating_sub(js::len(&marker));
  let head = (room as f64 * 0.65).ceil() as usize;
  format!(
    "{}{marker}{}",
    js::prefix(text, head),
    js::suffix(text, room.saturating_sub(head))
  )
}
