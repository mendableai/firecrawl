//! Rebuilds the inline tokens `marked.lexer` would produce from markdown-rs's
//! mdast, so the TS walk over them can be ported as is.

use std::{cell::Cell, collections::HashMap};

use markdown::mdast::Node;

use super::html_text::{escape_encode, escape_no_encode};

mod marked_emphasis;

/// A marked inline token. Texts are what marked stores in `token.text`.
pub enum Token {
  Text(String),
  Escape(String),
  Strong(Vec<Token>),
  Em(Vec<Token>),
  Del(Vec<Token>),
  Link { href: String, tokens: Vec<Token> },
  Image(String),
  Codespan(String),
  Br,
  Html,
}

#[derive(Clone, Copy)]
pub struct InlineContext<'a> {
  /// The markdown the mdast positions point into.
  pub source: &'a str,
  /// Link reference definitions by normalized identifier.
  pub definitions: &'a HashMap<String, String>,
  /// How many blockquotes the text is in, for the `>` markers its raw lines carry.
  pub quote_depth: usize,
  /// In a link label, where marked unescapes `\[` and `\]` before lexing.
  pub in_link: bool,
  /// In a span marked's `blockSkip` masks, where emphasis can't close.
  pub masked: bool,
  /// Work left for re-lexing where marked parts from the tree; see
  /// [`marked_emphasis`].
  pub budget: &'a Cell<usize>,
  /// How deeply the content is nested in other inline nodes.
  pub depth: usize,
}

/// Nesting deeper than any real page. marked overflows the JS stack on
/// some way past it, and Rust must not overflow a worker's.
pub const MAX_DEPTH: usize = 128;

impl InlineContext<'_> {
  pub fn tokens(&self, nodes: &[Node]) -> Vec<Token> {
    let mut tokens = Vec::new();
    if let Some(rest) = self.push_until_split(&mut tokens, nodes) {
      self
        .reparsed(&rest)
        .into_iter()
        .for_each(|token| push_token(&mut tokens, token));
    }
    tokens
  }

  fn nested(&self) -> Self {
    InlineContext {
      depth: self.depth + 1,
      ..*self
    }
  }

  fn push_node(&self, tokens: &mut Vec<Token>, node: &Node) {
    if self.depth > MAX_DEPTH {
      return self.push_text(tokens, self.raw(node).unwrap_or_default());
    }
    let token = match node {
      Node::Text(x) => {
        match self.raw_text(node) {
          Some(raw) => self.push_text(tokens, &self.strip_quote_markers(raw)),
          None => self.push_text(tokens, &x.value),
        }
        return;
      }
      Node::Strong(_) | Node::Emphasis(_) if self.masked => {
        return self.push_literal_emphasis(tokens, node);
      }
      Node::Strong(x) => Token::Strong(self.nested().tokens(&x.children)),
      Node::Emphasis(x) => Token::Em(self.nested().tokens(&x.children)),
      Node::Delete(x) => Token::Del(self.nested().tokens(&x.children)),
      Node::Link(x) => {
        let raw = self.raw(node).unwrap_or_default();
        if raw.starts_with('[')
          && let Some(label) = rejected_label(node, raw, 1)
        {
          return self.push_unlinked(tokens, raw, 0, label);
        }
        // marked finds no bare URLs in a link label.
        if self.in_link && !raw.starts_with(['[', '<']) {
          let nested = self.nested();
          return x
            .children
            .iter()
            .for_each(|child| nested.push_node(tokens, child));
        }
        if !raw.starts_with(['[', '<']) {
          let lower = raw.to_ascii_lowercase();
          if (lower.starts_with("mailto:") || lower.starts_with("xmpp:"))
            && let Some((scheme, rest)) = raw.split_once(':')
          {
            return self.push_scheme_email(tokens, scheme, rest);
          }
        }
        // marked escapes an autolink's href; other hrefs stay raw.
        let href = match raw.starts_with('<') {
          true => escape_no_encode(&x.url),
          false => x.url.clone(),
        };
        Token::Link {
          href,
          tokens: self.label_tokens(&x.children),
        }
      }
      Node::LinkReference(x) => Token::Link {
        href: self
          .definitions
          .get(&x.identifier)
          .cloned()
          .unwrap_or_default(),
        tokens: self.label_tokens(&x.children),
      },
      Node::Image(x) => {
        let raw = self.raw(node).unwrap_or_default();
        if let Some(label) = rejected_label(node, raw, 2) {
          return self.push_unlinked(tokens, raw, 1, label);
        }
        Token::Image(self.image_alt(node, &x.alt))
      }
      Node::ImageReference(x) => Token::Image(self.image_alt(node, &x.alt)),
      Node::InlineCode(x) => Token::Codespan(escape_encode(&x.value)),
      Node::Break(_) => Token::Br,
      Node::Html(_) => Token::Html,
      other => {
        for child in other.children().into_iter().flatten() {
          self.nested().push_node(tokens, child);
        }
        return;
      }
    };
    push_token(tokens, token);
  }

  fn label_tokens(&self, nodes: &[Node]) -> Vec<Token> {
    InlineContext {
      in_link: true,
      depth: self.depth + 1,
      ..*self
    }
    .tokens(nodes)
  }

  /// marked has no `mailto:` or `xmpp:` literal autolinks: the scheme stays
  /// text and only the address after it links.
  fn push_scheme_email(&self, tokens: &mut Vec<Token>, scheme: &str, rest: &str) {
    let (address, resource) = rest.split_at(rest.find('/').unwrap_or(rest.len()));
    self.push_text(tokens, &format!("{scheme}:"));
    push_token(
      tokens,
      Token::Link {
        href: format!("mailto:{address}"),
        tokens: vec![Token::Text(address.to_string())],
      },
    );
    self.push_text(tokens, resource);
  }

  /// Emphasis as marked lexes it where it can't close: its delimiters as text.
  fn push_literal_emphasis(&self, tokens: &mut Vec<Token>, node: &Node) {
    let children = node.children().map(Vec::as_slice).unwrap_or_default();
    let (Some(outer), Some(first), Some(last)) = (
      node.position(),
      children.first().and_then(Node::position),
      children.last().and_then(Node::position),
    ) else {
      return;
    };
    let open = self.source.get(outer.start.offset..first.start.offset);
    let close = self.source.get(last.end.offset..outer.end.offset);
    self.push_text(tokens, open.unwrap_or_default());
    let nested = self.nested();
    children
      .iter()
      .for_each(|child| nested.push_node(tokens, child));
    self.push_text(tokens, close.unwrap_or_default());
  }

  /// What marked lexes when a link fails: the `[` as text, then everything
  /// after it as ordinary inline content.
  fn push_unlinked(&self, tokens: &mut Vec<Token>, raw: &str, bracket: usize, label: &str) {
    let masked = self.masked || is_block_skipped(raw, bracket, label);
    let unlinked = self.reparse_inline(&raw[..bracket], &raw[bracket + 1..], "[", masked);
    unlinked
      .into_iter()
      .for_each(|token| push_token(tokens, token));
  }

  /// Lines marked keeps in a paragraph that CommonMark starts an HTML block
  /// with, lexed as inline content.
  pub fn html_continuation(&self, raw: &str) -> Vec<Token> {
    self.reparse_inline("", raw, "", self.masked)
  }

  /// `prefix` and `raw` lexed as inline content, with a character that opens
  /// nothing between them so `raw` can't start a block or a link. The
  /// character becomes `replacement` in the result.
  fn reparse_inline(&self, prefix: &str, raw: &str, replacement: &str, masked: bool) -> Vec<Token> {
    const PLACEHOLDER: char = '\u{a1}';
    let source = format!("{prefix}{PLACEHOLDER}{}", self.strip_quote_markers(raw));
    let Ok(root) = markdown::to_mdast(&source, &super::parse_options()) else {
      return vec![Token::Text(escape_no_encode(&format!(
        "{prefix}{replacement}{raw}"
      )))];
    };
    let context = InlineContext {
      source: &source,
      quote_depth: 0,
      masked,
      depth: self.depth + 1,
      ..*self
    };
    let mut tokens = Vec::new();
    for block in root.children().into_iter().flatten() {
      if let Node::Paragraph(x) = block {
        x.children
          .iter()
          .for_each(|child| context.push_node(&mut tokens, child));
      }
    }
    if let Some(Token::Text(first)) = tokens.first_mut() {
      *first = first.replacen(PLACEHOLDER, replacement, 1);
    }
    tokens
  }

  fn raw(&self, node: &Node) -> Option<&str> {
    let position = node.position()?;
    self.source.get(position.start.offset..position.end.offset)
  }

  /// A text node's source. mdast starts a text that follows another inline
  /// node after its leading backslash escape, so that is added back.
  fn raw_text(&self, node: &Node) -> Option<&str> {
    let position = node.position()?;
    let mut start = position.start.offset;
    let escaped = self
      .source
      .get(start..)?
      .starts_with(|c: char| c.is_ascii_punctuation());
    if escaped && start > 0 && self.source.as_bytes().get(start - 1) == Some(&b'\\') {
      start -= 1;
    }
    self.source.get(start..position.end.offset)
  }

  /// Drops the `>` markers that start a quoted text's continuation lines;
  /// marked lexes blockquote content with them removed.
  pub fn strip_quote_markers(&self, raw: &str) -> String {
    if self.quote_depth == 0 {
      return raw.to_string();
    }
    let mut lines = raw.split('\n');
    let mut out = lines.next().unwrap_or_default().to_string();
    for line in lines {
      let mut line = line.trim_start_matches([' ', '\t']);
      for _ in 0..self.quote_depth {
        match line.strip_prefix('>') {
          Some(x) => line = x.trim_start_matches([' ', '\t']),
          None => break,
        }
      }
      out.push('\n');
      out.push_str(line);
    }
    out
  }

  /// marked lexes `\` + ASCII punctuation as its own escape token, and
  /// merges consecutive text tokens.
  fn push_text(&self, tokens: &mut Vec<Token>, raw: &str) {
    let mut run = String::new();
    let mut chars = raw.chars().peekable();
    while let Some(c) = chars.next() {
      let escaped = match chars.peek() {
        Some('[' | ']') if c == '\\' && self.in_link => continue,
        Some(next) if c == '\\' && next.is_ascii_punctuation() => *next,
        _ => {
          run.push(c);
          continue;
        }
      };
      chars.next();
      push_run(tokens, &mut run);
      tokens.push(Token::Escape(escape_no_encode(&escaped.to_string())));
    }
    push_run(tokens, &mut run);
  }

  /// marked's image `text`: the raw label, with only `\[` and `\]` unescaped.
  fn image_alt(&self, node: &Node, alt: &str) -> String {
    let label = self
      .raw(node)
      .and_then(|raw| raw.strip_prefix("!["))
      .and_then(|raw| raw.get(..label_end(raw)?));
    let label = match label {
      Some(x) => x.replace("\\[", "[").replace("\\]", "]"),
      None => alt.to_string(),
    };
    escape_no_encode(&label)
  }
}

/// The label of a link or image `node` whose raw source starts its label at
/// byte `start`, when marked's link `label` rule rejects it. Unlike
/// CommonMark, that rule allows no backslash before a line break, no
/// unpaired backtick and no brackets nested beyond one level.
fn rejected_label<'r>(node: &Node, raw: &'r str, start: usize) -> Option<&'r str> {
  let end = match (node.position(), node.children().and_then(|x| x.last())) {
    (Some(node), Some(last)) => last
      .position()
      .map(|last| last.end.offset.saturating_sub(node.start.offset)),
    _ => raw.get(start..).and_then(label_end).map(|x| x + start),
  };
  let label = raw.get(start..end?)?;
  let mut chars = label.chars();
  while let Some(c) = chars.next() {
    let ok = match c {
      '\\' => chars.next().is_some_and(|x| x != '\n'),
      '`' => chars.any(|x| x == '`'),
      '[' => loop {
        match chars.next() {
          Some('\\') if chars.next().is_some_and(|x| x != '\n') => {}
          Some(']') => break true,
          Some('[' | '\\') | None => break false,
          Some(_) => {}
        }
      },
      ']' => false,
      _ => true,
    };
    if !ok {
      return Some(label);
    }
  }
  None
}

/// Whether marked's `blockSkip` masks the link: `\[[^[\]]*?\]\([^\(\)]*?\)`.
fn is_block_skipped(raw: &str, bracket: usize, label: &str) -> bool {
  let tail = raw.get(bracket + 1 + label.len()..).unwrap_or_default();
  let destination = tail
    .strip_prefix("](")
    .and_then(|x| x.strip_suffix(')'))
    .unwrap_or("(");
  !label.contains(['[', ']']) && !destination.contains(['(', ')'])
}

fn push_run(tokens: &mut Vec<Token>, run: &mut String) {
  if run.is_empty() {
    return;
  }
  push_token(tokens, Token::Text(escape_no_encode(run)));
  run.clear();
}

/// Pushes `token`, merging consecutive texts like marked does.
fn push_token(tokens: &mut Vec<Token>, token: Token) {
  match (tokens.last_mut(), token) {
    (Some(Token::Text(last)), Token::Text(text)) => last.push_str(&text),
    (_, token) => tokens.push(token),
  }
}

/// The byte index of the `]` closing a link label that starts at `raw`.
fn label_end(raw: &str) -> Option<usize> {
  let mut depth = 0usize;
  let mut escaped = false;
  for (i, b) in raw.bytes().enumerate() {
    match b {
      _ if escaped => escaped = false,
      b'\\' => escaped = true,
      b'[' => depth += 1,
      b']' if depth == 0 => return Some(i),
      b']' => depth -= 1,
      _ => {}
    }
  }
  None
}
