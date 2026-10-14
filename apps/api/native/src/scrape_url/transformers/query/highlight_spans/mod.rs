//! Port of TS `lib/highlight-spans.ts`: the line-like spans the highlights
//! and directQuote models were trained on, and their reassembly into
//! markdown. TS lexes with `marked`; this walks markdown-rs's mdast after
//! rebuilding the tokens marked would produce (see [`inline`]).

use std::{cell::Cell, collections::HashMap};

use markdown::{
  Constructs, ParseOptions,
  mdast::{Code, Node},
};

use self::html_text::{he_decode, is_js_space};
use self::inline::{InlineContext, MAX_DEPTH, Token};

mod assemble;
mod html_text;
mod inline;
mod marked_blocks;

pub use assemble::assemble_answer;
pub use html_text::js_trim;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SentenceSource {
  Heading,
  Text,
  Code,
  Table,
}

pub struct Sentence {
  pub text: String,
  pub source: SentenceSource,
  pub block_id: usize,
  pub lang: Option<String>,
  pub is_header: bool,
}

/// TS `parseMarkdownToSentences`.
pub fn parse_markdown_to_sentences(markdown: &str) -> Vec<Sentence> {
  // marked normalizes line endings before lexing.
  let source = markdown.replace("\r\n", "\n").replace('\r', "\n");
  let Ok(root) = markdown::to_mdast(&source, &parse_options()) else {
    return Vec::new();
  };
  let definitions = collect_definitions(&root);
  // Bounds re-lexing where marked parts from the tree to about one more
  // pass over the page; real pages use a few percent. Past it the
  // CommonMark tree stands.
  let budget = Cell::new(source.len().max(1 << 16));
  let mut walker = Walker {
    source: &source,
    definitions: &definitions,
    budget: &budget,
    sentences: Vec::new(),
    block_id: 0,
    depth: 0,
    walked_list: false,
  };
  if let Some(children) = root.children() {
    walker.walk_blocks(children, true, 0);
  }
  walker.sentences
}

fn parse_options() -> ParseOptions {
  ParseOptions {
    constructs: Constructs {
      // marked has no footnotes; `[^1]: x` is a link definition to it.
      gfm_footnote_definition: false,
      gfm_label_start_footnote: false,
      ..Constructs::gfm()
    },
    ..ParseOptions::default()
  }
}

fn collect_definitions(root: &Node) -> HashMap<String, String> {
  let mut definitions = HashMap::new();
  let mut stack = vec![root];
  while let Some(node) = stack.pop() {
    if let Node::Definition(x) = node {
      // The first definition of a label wins, in marked as in CommonMark.
      definitions
        .entry(x.identifier.clone())
        .or_insert_with(|| x.url.clone());
    }
    stack.extend(node.children().into_iter().flatten().rev());
  }
  definitions
}

struct Walker<'a> {
  source: &'a str,
  definitions: &'a HashMap<String, String>,
  budget: &'a Cell<usize>,
  sentences: Vec<Sentence>,
  block_id: usize,
  /// How deeply the blocks walked are nested.
  depth: usize,
  /// Whether a list was walked since the last reset; marked's lexer leaves
  /// `top` on after one.
  walked_list: bool,
}

impl Walker<'_> {
  fn next_block(&mut self) -> usize {
    self.block_id += 1;
    self.block_id - 1
  }

  fn inline(&self, quote_depth: usize) -> InlineContext<'_> {
    InlineContext {
      source: self.source,
      definitions: self.definitions,
      quote_depth,
      in_link: false,
      masked: false,
      budget: self.budget,
      depth: 0,
    }
  }

  /// TS `walkBlocks` over block tokens. `top` is marked's lexer state: off
  /// in list items, where paragraphs lex as `text` tokens whose inline
  /// tokens TS walks as blocks.
  fn walk_blocks(&mut self, nodes: &[Node], top: bool, quote_depth: usize) {
    if self.depth > MAX_DEPTH {
      return;
    }
    self.depth += 1;
    self.walk_siblings(nodes, top, quote_depth);
    self.depth -= 1;
  }

  fn walk_siblings(&mut self, nodes: &[Node], top: bool, quote_depth: usize) {
    let mut skip_next = false;
    for (index, node) in nodes.iter().enumerate() {
      if std::mem::take(&mut skip_next) {
        continue;
      }
      match node {
        Node::Heading(x) => {
          let bid = self.next_block();
          let tokens = self.inline(quote_depth).tokens(&x.children);
          let text = extract_inline_text(&tokens);
          self.push(js_trim(&text), SentenceSource::Heading, bid, None, false);
        }
        Node::Paragraph(_) if top && self.split_at_table_rows(node, quote_depth) => {}
        Node::Paragraph(_) if !top && self.split_at_list_marker(node, quote_depth) => {}
        Node::Paragraph(x) => {
          let bid = self.next_block();
          let mut tokens = self.inline(quote_depth).tokens(&x.children);
          if top && let Some(html) = self.html_continuation(node, nodes.get(index + 1)) {
            tokens.push(Token::Text("\n".to_string()));
            tokens.extend(self.inline(quote_depth).html_continuation(html));
            skip_next = true;
          }
          if top {
            self.push_sentences(&extract_inline_text(&tokens), SentenceSource::Text, bid);
          } else {
            self.walk_tokens(&tokens);
          }
        }
        Node::List(x) => {
          for item in &x.children {
            let Some(children) = item.children() else {
              continue;
            };
            // A nested list leaves marked's `top` on for the rest of the item.
            let mut item_top = false;
            for child in children {
              self.walked_list = false;
              self.walk_blocks(std::slice::from_ref(child), item_top, quote_depth);
              item_top |= self.walked_list;
            }
          }
          self.walked_list = true;
        }
        Node::Blockquote(x) => {
          let walked_list = self.walked_list;
          self.walk_blocks(&x.children, true, quote_depth + 1);
          self.walked_list = walked_list;
        }
        Node::Table(x) => self.walk_table(&x.children, quote_depth),
        Node::Code(x) => self.walk_code(x),
        Node::ThematicBreak(_) | Node::Html(_) => {}
        other => {
          self.next_block();
          if let Some(children) = other.children() {
            self.walk_blocks(children, top, quote_depth);
          }
        }
      }
    }
  }

  fn walk_table(&mut self, rows: &[Node], quote_depth: usize) {
    let bid = self.next_block();
    // marked drops cells past the header's count.
    let columns = rows.first().and_then(Node::children).map_or(0, Vec::len);
    for (index, row) in rows.iter().enumerate() {
      let cells = row.children().into_iter().flatten().take(columns);
      let cells = cells.filter_map(|cell| {
        let tokens = self.inline(quote_depth).tokens(cell.children()?);
        let text = js_trim(&extract_inline_text(&tokens)).to_string();
        (!text.is_empty()).then_some(text)
      });
      let text = cells.collect::<Vec<_>>().join(" | ");
      self.push(&text, SentenceSource::Table, bid, None, index == 0);
    }
  }

  fn walk_code(&mut self, code: &Code) {
    let bid = self.next_block();
    let lang = self.code_lang(code);
    for line in code.value.split('\n') {
      self.push(
        js_trim(line),
        SentenceSource::Code,
        bid,
        lang.clone(),
        false,
      );
    }
  }

  /// marked's fence `lang`: the whole info string, trimmed and unescaped.
  fn code_lang(&self, code: &Code) -> Option<String> {
    code.lang.as_ref()?;
    let position = code.position.as_ref()?;
    let first_line = self
      .source
      .get(position.start.offset..position.end.offset)?
      .lines()
      .next()?
      .trim_start_matches(' ');
    let fence = first_line
      .chars()
      .next()
      .filter(|c| *c == '`' || *c == '~')?;
    let info = js_trim(first_line.trim_start_matches(fence));
    let mut lang = String::with_capacity(info.len());
    let mut chars = info.chars().peekable();
    while let Some(c) = chars.next() {
      match chars.peek() {
        Some(next) if c == '\\' && next.is_ascii_punctuation() => {}
        _ => lang.push(c),
      }
    }
    (!lang.is_empty()).then_some(lang)
  }

  /// TS `walkBlocks` reaching inline tokens, which all take its default branch.
  fn walk_tokens(&mut self, tokens: &[Token]) {
    for token in tokens {
      match token {
        Token::Html => {}
        Token::Strong(x) | Token::Em(x) | Token::Del(x) | Token::Link { tokens: x, .. } => {
          self.next_block();
          self.walk_tokens(x);
        }
        Token::Text(x) | Token::Escape(x) | Token::Image(x) | Token::Codespan(x) => {
          let bid = self.next_block();
          self.push_sentences(x, SentenceSource::Text, bid);
        }
        Token::Br => {
          self.next_block();
        }
      }
    }
  }

  /// TS `pushSentences`.
  fn push_sentences(&mut self, text: &str, source: SentenceSource, bid: usize) {
    let mut collapsed = String::with_capacity(text.len());
    for c in text.chars() {
      match (is_js_space(c), collapsed.ends_with(' ')) {
        (true, true) => {}
        (true, false) => collapsed.push(' '),
        (false, _) => collapsed.push(c),
      }
    }
    let mut start = 0;
    let trimmed = js_trim(&collapsed);
    for (i, _) in trimmed.match_indices(' ') {
      if trimmed[..i].ends_with(['.', '!', '?']) {
        self.push(js_trim(&trimmed[start..i]), source, bid, None, false);
        start = i + 1;
      }
    }
    self.push(js_trim(&trimmed[start..]), source, bid, None, false);
  }

  fn push(
    &mut self,
    text: &str,
    source: SentenceSource,
    block_id: usize,
    lang: Option<String>,
    is_header: bool,
  ) {
    if text.is_empty() {
      return;
    }
    self.sentences.push(Sentence {
      text: text.to_string(),
      source,
      block_id,
      lang,
      is_header,
    });
  }
}

/// TS `extractInlineText`, which decodes entities at every level.
fn extract_inline_text(tokens: &[Token]) -> String {
  let mut out = String::new();
  for token in tokens {
    match token {
      Token::Text(x) | Token::Codespan(x) | Token::Escape(x) | Token::Image(x) => out.push_str(x),
      Token::Strong(x) | Token::Em(x) | Token::Del(x) => out.push_str(&extract_inline_text(x)),
      Token::Link { href, tokens } => {
        let link_text = extract_inline_text(tokens);
        if !(is_citation_marker(&link_text) && href.contains("cite_note")) {
          out.push_str(&format!("[{link_text}]({href})"));
        }
      }
      Token::Br => out.push(' '),
      Token::Html => {}
    }
  }
  he_decode(&out)
}

/// `/^\[?\w{1,3}\]?$/`
fn is_citation_marker(text: &str) -> bool {
  let text = text.strip_prefix('[').unwrap_or(text);
  let text = text.strip_suffix(']').unwrap_or(text);
  (1..=3).contains(&text.len()) && text.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
}
