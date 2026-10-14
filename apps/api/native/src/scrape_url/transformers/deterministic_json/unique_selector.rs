//! TS `uniqueSelector` and its helpers from `pipeline/anchor.ts`: a CSS
//! selector that returns exactly one element on the whole document.

use std::sync::LazyLock;

use kuchikiki::{ElementData, NodeRef};
use regex::Regex;

use super::{dom, js};

const STABLE_ATTRS: &[&str] = &["itemprop", "data-testid", "data-test", "role", "name"];

static STABLE_ID: LazyLock<Regex> =
  LazyLock::new(|| Regex::new("^[A-Za-z][A-Za-z0-9_-]*$").expect("static regex"));
static UTILITY_CLASS: LazyLock<Regex> =
  LazyLock::new(|| Regex::new(r"^[a-z-]+-\[?[0-9.]").expect("static regex"));
static MODULE_HASH_CLASS: LazyLock<Regex> =
  LazyLock::new(|| Regex::new("[A-Za-z]_[A-Za-z0-9]{4,}$").expect("static regex"));
static STATE_CLASS: LazyLock<Regex> = LazyLock::new(|| {
  Regex::new("^(is-|has-|js-|active|selected|hidden|open)").expect("static regex")
});

fn css_escape(s: &str) -> String {
  let mut out = String::with_capacity(s.len());
  for c in s.chars() {
    if !(c.is_ascii_alphanumeric() || c == '_' || c == '-') {
      out.push('\\');
    }
    out.push(c);
  }
  out
}

fn is_stable_class(c: &str) -> bool {
  !UTILITY_CLASS.is_match(c)
    && !MODULE_HASH_CLASS.is_match(c)
    && !STATE_CLASS.is_match(c)
    && js::len(c) >= 2
}

fn stable_id(el: &ElementData) -> Option<String> {
  dom::get_attribute(el, "id").filter(|id| STABLE_ID.is_match(id))
}

fn tag(el: &ElementData) -> String {
  dom::tag_name(el).to_lowercase()
}

fn stable_classes(el: &ElementData) -> Vec<String> {
  dom::class_list(el)
    .into_iter()
    .filter(|x| is_stable_class(x))
    .collect()
}

fn class_chain(classes: &[String]) -> String {
  classes
    .iter()
    .map(|c| format!(".{}", css_escape(c)))
    .collect()
}

/// A selector fragment for the element's own stable hook, not checked for uniqueness.
fn own_hook(el: &ElementData) -> Option<String> {
  let tag = tag(el);
  if let Some(id) = stable_id(el) {
    return Some(format!("#{id}"));
  }
  for attr in STABLE_ATTRS {
    if let Some(v) = dom::get_attribute(el, attr).filter(|x| !x.is_empty()) {
      return Some(format!("{tag}[{attr}=\"{v}\"]"));
    }
  }
  let classes = stable_classes(el);
  (!classes.is_empty()).then(|| format!("{tag}{}", class_chain(&classes)))
}

/// TS `uniqueSelector`: the element's own hook first, then scoped by an ancestor's.
pub fn unique_selector(doc: &NodeRef, node: &NodeRef) -> Option<String> {
  let matches_one = |selector: &str| match dom::query_selector_all(doc, selector) {
    Some(found) => found.len() == 1 && dom::same(&found[0], node),
    None => false,
  };
  let el = node.as_element()?;
  let tag = tag(el);

  if let Some(id) = stable_id(el)
    && matches_one(&format!("#{id}"))
  {
    return Some(format!("#{id}"));
  }
  for attr in STABLE_ATTRS {
    if let Some(v) = dom::get_attribute(el, attr).filter(|x| !x.is_empty()) {
      let selector = format!("{tag}[{attr}=\"{v}\"]");
      if matches_one(&selector) {
        return Some(selector);
      }
    }
  }
  let classes = stable_classes(el);
  for n in 1..=classes.len() {
    let selector = format!("{tag}{}", class_chain(&classes[..n]));
    if matches_one(&selector) {
      return Some(selector);
    }
  }

  let mut leaf_forms = vec![tag.clone()];
  if let Some(first) = classes.first() {
    leaf_forms.push(format!("{tag}.{}", css_escape(first)));
  }
  let mut ancestor = dom::parent_element(node);
  for _ in 0..5 {
    let Some(current) = ancestor else {
      break;
    };
    if let Some(hook) = current.as_element().and_then(own_hook) {
      for leaf in &leaf_forms {
        let selector = format!("{hook} {leaf}");
        if matches_one(&selector) {
          return Some(selector);
        }
      }
    }
    ancestor = dom::parent_element(&current);
  }
  None
}
