//! marked's `emStrong` for `_` delimiters, which can close inside a link
//! destination that `blockSkip` leaves unmasked, or pair a delimiter
//! CommonMark leaves literal.

use std::{cell::Cell, ops::Range, sync::LazyLock};

use markdown::mdast::Node;
use regex::Regex;

use super::{InlineContext, Token, push_token};

/// marked's `blockSkip`: what it masks before looking for delimiters.
static BLOCK_SKIP: LazyLock<Regex> = LazyLock::new(|| {
  Regex::new(r"\[[^\[\]]*?\]\([^()]*?\)|`[^`]*?`|<[^<>]*?>")
    .expect("BLOCK_SKIP is a valid static regex pattern")
});

static ESCAPED_PUNCTUATION: LazyLock<Regex> = LazyLock::new(|| {
  Regex::new(r"\\[\p{P}\p{S}]").expect("ESCAPED_PUNCTUATION is a valid static regex pattern")
});

static PUNCTUATION: LazyLock<Regex> = LazyLock::new(|| {
  Regex::new(r"^[\p{P}\p{S}]$").expect("PUNCTUATION is a valid static regex pattern")
});

/// The first branch of marked's `emStrongRDelimUnd`, which skips a `_`
/// inside `**`.
static STRONG_ORPHAN: LazyLock<Regex> = LazyLock::new(|| {
  Regex::new(r"^[^_*]*?\*\*[^_*]*?_[^_*]*?\*\*")
    .expect("STRONG_ORPHAN is a valid static regex pattern")
});

/// Starts a reparsed source so it can't open a block; dropped afterwards.
const PLACEHOLDER: char = '\u{a1}';

#[derive(Clone, Copy)]
enum Delim {
  Left,
  Right,
  Either,
}

/// Where marked's tokens part from the CommonMark tree.
struct Split {
  /// Source pushed as text.
  text: Range<usize>,
  /// The emphasis marked builds after `text`: its end and delimiter length.
  emphasis: Option<(usize, usize)>,
}

/// What marked's `emStrong` does with an opening run.
enum Closing {
  /// Ends the emphasis at this offset, with this delimiter length.
  At(usize, usize),
  /// Builds none; the run stays text.
  Never,
}

/// A run of `_` in the masked source and what `emStrongRDelimUnd` takes it for.
struct Run {
  start: usize,
  len: usize,
  delim: Option<Delim>,
}

/// The delimiter runs of one `inlineTokens` source, found lazily.
pub(super) struct Scan {
  runs: Vec<Run>,
  masked: String,
}

impl Scan {
  fn new(source: &str) -> Self {
    let mut bytes = source.as_bytes().to_vec();
    for found in BLOCK_SKIP.find_iter(source) {
      bytes[found.range()].fill(b'a');
      bytes[found.start()] = b'[';
      bytes[found.end() - 1] = b']';
    }
    let skipped = String::from_utf8_lossy(&bytes).into_owned();
    let mut bytes = skipped.as_bytes().to_vec();
    for found in ESCAPED_PUNCTUATION.find_iter(&skipped) {
      bytes[found.range()].fill(b'+');
    }
    let masked = String::from_utf8_lossy(&bytes).into_owned();
    let mut runs = Vec::new();
    let mut offset = 0;
    while let Some(found) = masked.get(offset..).and_then(|x| x.find('_')) {
      let start = offset + found;
      let len = masked[start..].bytes().take_while(|x| *x == b'_').count();
      let prev = masked[..start].chars().next_back();
      let next = masked[start + len..].chars().next();
      runs.push(Run {
        start,
        len,
        delim: prev.and_then(|prev| classify(prev, next)),
      });
      offset = start + len;
    }
    Self { runs, masked }
  }

  /// What marked's `emStrong` does with the `_` run at `start`, given the
  /// char it last lexed as text before it. marked matches the opening run
  /// unmasked. None once each run scanned has used up `budget`.
  fn close(
    &self,
    source: &str,
    start: usize,
    prev: Option<char>,
    budget: &Cell<usize>,
  ) -> Option<Closing> {
    let opened = source
      .get(start..)?
      .bytes()
      .take_while(|x| *x == b'_')
      .count();
    let Some(next) = source.get(start + opened..)?.chars().next() else {
      return Some(Closing::Never);
    };
    let after_word = prev.is_some_and(char::is_alphanumeric);
    let after_punctuation =
      prev.is_none_or(|x| is_space(x) || (is_punct(x) && x != '*' && x != '_'));
    let refused = (!is_punct(next) && after_word) || (is_punct(next) && !after_punctuation);
    if opened == 0 || is_space(next) || refused {
      return Some(Closing::Never);
    }
    let from = start + opened;
    let orphan = self.masked.get(from..).and_then(|x| STRONG_ORPHAN.find(x));
    let from = orphan.map_or(from, |x| from + x.end() - 2);
    let opened = opened as isize;
    let (mut total, mut mid) = (opened, 0);
    let first = self.runs.partition_point(|x| x.start <= from);
    for run in &self.runs[first..] {
      budget.set(budget.get().checked_sub(1)?);
      let length = run.len as isize;
      match run.delim {
        None => continue,
        Some(Delim::Left) => {
          total += length;
          continue;
        }
        Some(Delim::Either) if opened % 3 != 0 && (opened + length) % 3 == 0 => {
          mid += length;
          continue;
        }
        Some(_) => total -= length,
      }
      if total > 0 {
        continue;
      }
      let closed = length.min(length + total + mid);
      let delim = if opened.min(closed) % 2 == 1 { 1 } else { 2 };
      let end = run.start + usize::try_from(closed).ok()?;
      return Some(match end >= start + 2 * delim {
        true => Closing::At(end, delim),
        false => Closing::Never,
      });
    }
    Some(Closing::Never)
  }
}

fn is_punct(c: char) -> bool {
  PUNCTUATION.is_match(c.encode_utf8(&mut [0; 4]))
}

fn is_space(c: char) -> bool {
  c.is_whitespace() || c == '\u{feff}'
}

/// The `emStrongRDelimUnd` branch a run between `prev` and `next` matches.
fn classify(prev: char, next: Option<char>) -> Option<Delim> {
  let (prev_punct, prev_space) = (is_punct(prev), is_space(prev));
  let prev_other = !prev_punct && !prev_space;
  let Some(next) = next else {
    return (!prev_space).then_some(Delim::Right);
  };
  let (next_punct, next_space) = (is_punct(next), is_space(next));
  if (prev_punct && next_space) || (prev_other && (next_punct || next_space)) {
    return Some(Delim::Right);
  }
  if (!prev_other && !next_punct && !next_space) || (prev_space && next_punct) {
    return Some(Delim::Left);
  }
  (prev_punct && next_punct).then_some(Delim::Either)
}

impl InlineContext<'_> {
  /// Pushes the tokens of `nodes` up to the first `_` emphasis marked
  /// lexes differently from CommonMark, and returns the source after it.
  pub(super) fn push_until_split(&self, tokens: &mut Vec<Token>, nodes: &[Node]) -> Option<String> {
    let mut scan = None;
    for (index, node) in nodes.iter().enumerate() {
      let split = match self.masked || self.quote_depth > 0 {
        true => None,
        false => self.split(nodes, index, &mut scan),
      };
      let container_end = nodes.last().and_then(Node::position)?.end.offset;
      let affordable = split.filter(|x| self.charge(container_end.saturating_sub(x.text.start)));
      let Some(Split { text, emphasis }) = affordable else {
        self.push_node(tokens, node);
        continue;
      };
      self.push_text(tokens, self.source.get(text.clone())?);
      let mut rest = text.end;
      if let Some((end, delim)) = emphasis {
        let inner = self
          .nested()
          .reparsed(self.source.get(text.end + delim..end - delim)?);
        push_token(
          tokens,
          if delim == 1 {
            Token::Em(inner)
          } else {
            Token::Strong(inner)
          },
        );
        rest = end;
      }
      return self.source.get(rest..container_end).map(str::to_string);
    }
    None
  }

  /// How marked lexes `nodes[index]` when it parts from the tree: an
  /// emphasis it closes elsewhere or not at all, or a literal `_` it opens
  /// emphasis with.
  fn split(&self, nodes: &[Node], index: usize, scan: &mut Option<Scan>) -> Option<Split> {
    let node = &nodes[index];
    let position = node.position()?;
    let (start, end) = (position.start.offset, position.end.offset);
    let base = nodes.first().and_then(Node::position)?.start.offset;
    let container = self
      .source
      .get(base..nodes.last().and_then(Node::position)?.end.offset)?;
    match node {
      Node::Emphasis(_) | Node::Strong(_) => {
        let run = self
          .source
          .get(start..)?
          .bytes()
          .take_while(|x| *x == b'_')
          .count();
        if run == 0 || self.source[..start].ends_with('_') {
          return None;
        }
        let after_text = index > 0 && matches!(nodes[index - 1], Node::Text(_));
        let prev = self.source[..start]
          .chars()
          .next_back()
          .filter(|_| after_text);
        let scan = scan.get_or_insert_with(|| Scan::new(container));
        match scan.close(container, start - base, prev, self.budget)? {
          Closing::At(close, _) if close + base == end => None,
          Closing::At(close, delim) => Some(Split {
            text: start..start,
            emphasis: Some((close + base, delim)),
          }),
          Closing::Never => Some(Split {
            text: start..start + run,
            emphasis: None,
          }),
        }
      }
      Node::Text(_) => {
        let raw = self.raw_text(node).filter(|x| x.contains('_'))?;
        let from = end - raw.len();
        let scan = &*scan.get_or_insert_with(|| Scan::new(container));
        let mut offset = from;
        while let Some(found) = self.source.get(offset..end)?.find('_') {
          let mut start = offset + found;
          offset = start
            + self.source[start..end]
              .bytes()
              .take_while(|x| *x == b'_')
              .count();
          let backslashes = self.source[from..start]
            .bytes()
            .rev()
            .take_while(|x| *x == b'\\')
            .count();
          let escaped = backslashes % 2 == 1;
          start += usize::from(escaped);
          if start == offset {
            continue;
          }
          let prev = self.source[from..start]
            .chars()
            .next_back()
            .filter(|_| !escaped);
          if let Closing::At(close, delim) =
            scan.close(container, start - base, prev, self.budget)?
          {
            return Some(Split {
              text: from..start,
              emphasis: Some((close + base, delim)),
            });
          }
        }
        None
      }
      _ => None,
    }
  }

  /// Takes `cost` from the budget, or empties it when it can't cover it.
  fn charge(&self, cost: usize) -> bool {
    let left = self.budget.get().checked_sub(cost);
    self.budget.set(left.unwrap_or(0));
    left.is_some()
  }

  /// `raw` lexed as inline content of its own, like marked's
  /// `inlineTokens` on an emphasis's text or on what follows it.
  pub(super) fn reparsed(&self, raw: &str) -> Vec<Token> {
    let mut tokens = Vec::new();
    let mut rest = self.push_reparsed(&mut tokens, raw);
    while let Some(raw) = rest {
      rest = self.push_reparsed(&mut tokens, &raw);
    }
    tokens
  }

  fn push_reparsed(&self, tokens: &mut Vec<Token>, raw: &str) -> Option<String> {
    let source = format!("{PLACEHOLDER}{raw}");
    let root = markdown::to_mdast(&source, &super::super::parse_options()).ok()?;
    let context = InlineContext {
      source: &source,
      quote_depth: 0,
      ..*self
    };
    let mut local = Vec::new();
    let mut rest = None;
    for block in root.children().into_iter().flatten() {
      if let Node::Paragraph(x) = block {
        rest = context.push_until_split(&mut local, &x.children);
        break;
      }
    }
    if let Some(Token::Text(first)) = local.first_mut() {
      *first = first.replacen(PLACEHOLDER, "", 1);
      if first.is_empty() {
        local.remove(0);
      }
    }
    local
      .into_iter()
      .for_each(|token| push_token(tokens, token));
    rest
  }
}
