//! The jsdom behavior the TS port relies on, on top of kuchikiki: parsing
//! with scripting disabled, `tagName`, attribute order, `textContent` and
//! parse5's `outerHTML` serialization.

use std::rc::Rc;

use html5ever::{QualName, tendril::TendrilSink, tree_builder::TreeBuilderOpts};
use kuchikiki::{ElementData, ExpandedName, NodeData, NodeRef, ParseOpts, Selectors};

const HTML_NS: &str = "http://www.w3.org/1999/xhtml";
const XML_NS: &str = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NS: &str = "http://www.w3.org/2000/xmlns/";
const XLINK_NS: &str = "http://www.w3.org/1999/xlink";

/// `new JSDOM(html).window.document`. jsdom parses with scripting disabled.
pub fn parse_document(html: &str) -> NodeRef {
  let opts = ParseOpts {
    tree_builder: TreeBuilderOpts {
      scripting_enabled: false,
      ..Default::default()
    },
    ..Default::default()
  };
  kuchikiki::parse_html_with_options(opts).one(html)
}

pub fn document_element(doc: &NodeRef) -> Option<NodeRef> {
  doc.children().find(|x| x.as_element().is_some())
}

/// `document.body`: the first `body` or `frameset` child of the root element.
pub fn body(doc: &NodeRef) -> Option<NodeRef> {
  document_element(doc)?.children().find(|x| {
    x.as_element()
      .is_some_and(|el| is_html(el, "body") || is_html(el, "frameset"))
  })
}

fn qualified_name(name: &QualName) -> String {
  match &name.prefix {
    Some(prefix) => format!("{prefix}:{}", name.local),
    None => name.local.to_string(),
  }
}

/// `Element.tagName`: uppercased only for HTML elements.
pub fn tag_name(el: &ElementData) -> String {
  let name = qualified_name(&el.name);
  if &*el.name.ns == HTML_NS {
    name.to_ascii_uppercase()
  } else {
    name
  }
}

pub fn is_html(el: &ElementData, local: &str) -> bool {
  &*el.name.ns == HTML_NS && &*el.name.local == local
}

fn attribute_qualified_name(name: &ExpandedName, prefix: Option<&html5ever::Prefix>) -> String {
  match prefix {
    Some(prefix) => format!("{prefix}:{}", name.local),
    None => name.local.to_string(),
  }
}

fn find_attribute(el: &ElementData, name: &str) -> Option<ExpandedName> {
  let name = match &*el.name.ns == HTML_NS {
    true => name.to_ascii_lowercase(),
    false => name.to_string(),
  };
  el.attributes
    .borrow()
    .map
    .iter()
    .find(|(key, attr)| attribute_qualified_name(key, attr.prefix.as_ref()) == name)
    .map(|(key, _)| key.clone())
}

/// `Element.getAttributeNames()`.
pub fn attribute_names(el: &ElementData) -> Vec<String> {
  el.attributes
    .borrow()
    .map
    .iter()
    .map(|(key, attr)| attribute_qualified_name(key, attr.prefix.as_ref()))
    .collect()
}

/// `Element.getAttribute(name)`.
pub fn get_attribute(el: &ElementData, name: &str) -> Option<String> {
  let key = find_attribute(el, name)?;
  el.attributes
    .borrow()
    .map
    .get(&key)
    .map(|x| x.value.clone())
}

/// `Element.removeAttribute(name)`, keeping the order of the rest.
pub fn remove_attribute(el: &ElementData, name: &str) {
  if let Some(key) = find_attribute(el, name) {
    el.attributes.borrow_mut().map.shift_remove(&key);
  }
}

/// `Element.setAttribute(name, value)` on an attribute the element has.
pub fn set_existing_attribute(el: &ElementData, name: &str, value: String) {
  if let Some(key) = find_attribute(el, name)
    && let Some(attr) = el.attributes.borrow_mut().map.get_mut(&key)
  {
    attr.value = value;
  }
}

/// `Element.classList`: unique tokens split on ASCII whitespace.
pub fn class_list(el: &ElementData) -> Vec<String> {
  let value = get_attribute(el, "class").unwrap_or_default();
  let mut out: Vec<String> = Vec::new();
  for token in value
    .split(['\t', '\n', '\u{0C}', '\r', ' '])
    .filter(|x| !x.is_empty())
  {
    if !out.iter().any(|x| x == token) {
      out.push(token.to_string());
    }
  }
  out
}

/// `Element.children`.
pub fn element_children(node: &NodeRef) -> Vec<NodeRef> {
  node
    .children()
    .filter(|x| x.as_element().is_some())
    .collect()
}

/// `Element.parentElement`.
pub fn parent_element(node: &NodeRef) -> Option<NodeRef> {
  node.parent().filter(|x| x.as_element().is_some())
}

/// `Node.contains(other)`.
pub fn contains(node: &NodeRef, other: &NodeRef) -> bool {
  other
    .inclusive_ancestors()
    .any(|x| Rc::ptr_eq(&x.0, &node.0))
}

pub fn same(a: &NodeRef, b: &NodeRef) -> bool {
  Rc::ptr_eq(&a.0, &b.0)
}

/// `Node.textContent`.
pub fn text_content(node: &NodeRef) -> String {
  match node.data() {
    NodeData::Comment(x) | NodeData::Text(x) => x.borrow().clone(),
    NodeData::ProcessingInstruction(x) => x.borrow().1.clone(),
    _ => node.text_contents(),
  }
}

/// `Element.textContent = value`.
pub fn set_text_content(node: &NodeRef, value: &str) {
  for child in node.children().collect::<Vec<_>>() {
    child.detach();
  }
  if !value.is_empty() {
    node.append(NodeRef::new_text(value));
  }
}

/// `document.querySelectorAll(selector)`, or `None` when it would throw.
pub fn query_selector_all(root: &NodeRef, selector: &str) -> Option<Vec<NodeRef>> {
  let selectors = Selectors::compile(selector).ok()?;
  Some(
    root
      .descendants()
      .filter(|x| {
        x.clone()
          .into_element_ref()
          .is_some_and(|el| selectors.matches(&el))
      })
      .collect(),
  )
}

/// `Element.outerHTML`, serialized like parse5 does for jsdom. Iterative so
/// deeply nested pages can't overflow the stack.
pub fn outer_html(node: &NodeRef) -> String {
  enum Item {
    Node(NodeRef),
    Close(String),
  }
  let mut out = String::new();
  let mut stack = vec![Item::Node(node.clone())];
  while let Some(item) = stack.pop() {
    let node = match item {
      Item::Close(tag) => {
        out.push_str("</");
        out.push_str(&tag);
        out.push('>');
        continue;
      }
      Item::Node(node) => node,
    };
    let children = match node.data() {
      NodeData::Element(el) => {
        let tag = open_tag(el, &mut out);
        if &*el.name.ns == HTML_NS && VOID_ELEMENTS.contains(&&*el.name.local) {
          continue;
        }
        stack.push(Item::Close(tag));
        match (&el.template_contents, is_html(el, "template")) {
          (Some(contents), true) => contents.children(),
          _ => node.children(),
        }
      }
      NodeData::Text(text) => {
        match raw_text_parent(&node) {
          true => out.push_str(&text.borrow()),
          false => escape(&text.borrow(), false, &mut out),
        }
        continue;
      }
      NodeData::Comment(text) => {
        out.push_str("<!--");
        out.push_str(&text.borrow());
        out.push_str("-->");
        continue;
      }
      NodeData::Doctype(doctype) => {
        out.push_str("<!DOCTYPE ");
        out.push_str(&doctype.name);
        out.push('>');
        continue;
      }
      NodeData::Document(_) | NodeData::DocumentFragment => node.children(),
      NodeData::ProcessingInstruction(_) => continue,
    };
    stack.extend(children.rev().map(Item::Node));
  }
  out
}

const VOID_ELEMENTS: &[&str] = &[
  "area", "base", "basefont", "bgsound", "br", "col", "embed", "frame", "hr", "img", "input",
  "keygen", "link", "meta", "param", "source", "track", "wbr",
];
const UNESCAPED_TEXT: &[&str] = &[
  "style",
  "script",
  "xmp",
  "iframe",
  "noembed",
  "noframes",
  "plaintext",
];

fn raw_text_parent(node: &NodeRef) -> bool {
  node.parent().is_some_and(|parent| {
    parent
      .as_element()
      .is_some_and(|el| &*el.name.ns == HTML_NS && UNESCAPED_TEXT.contains(&&*el.name.local))
  })
}

/// Writes `<tag attrs>` and returns the tag name.
fn open_tag(el: &ElementData, out: &mut String) -> String {
  let tag = qualified_name(&el.name);
  out.push('<');
  out.push_str(&tag);
  for (key, attr) in el.attributes.borrow().map.iter() {
    out.push(' ');
    match &*key.ns {
      "" => out.push_str(&key.local),
      XML_NS => out.push_str(&format!("xml:{}", key.local)),
      XMLNS_NS if &*key.local == "xmlns" => out.push_str("xmlns"),
      XMLNS_NS => out.push_str(&format!("xmlns:{}", key.local)),
      XLINK_NS => out.push_str(&format!("xlink:{}", key.local)),
      _ => out.push_str(&attribute_qualified_name(key, attr.prefix.as_ref())),
    }
    out.push_str("=\"");
    escape(&attr.value, true, out);
    out.push('"');
  }
  out.push('>');
  tag
}

fn escape(text: &str, attribute: bool, out: &mut String) {
  for c in text.chars() {
    match c {
      '&' => out.push_str("&amp;"),
      '\u{A0}' => out.push_str("&nbsp;"),
      '"' if attribute => out.push_str("&quot;"),
      '<' if !attribute => out.push_str("&lt;"),
      '>' if !attribute => out.push_str("&gt;"),
      c => out.push(c),
    }
  }
}
