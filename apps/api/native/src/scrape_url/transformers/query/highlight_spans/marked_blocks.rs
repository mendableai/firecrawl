//! Where marked's block lexer splits content differently from CommonMark.

use std::sync::LazyLock;

use markdown::mdast::Node;
use regex::Regex;

use super::{Walker, parse_options};

/// The align row of marked's `gfmTable` rule.
static TABLE_DELIMITER_ROW: LazyLock<Regex> = LazyLock::new(|| {
  Regex::new(r"^ {0,3}(?:\| *)?:?-+:? *(?:\| *:?-+:? *)*(?:\| *)?$")
    .expect("TABLE_DELIMITER_ROW is a valid static regex pattern")
});

/// An ordered item of marked's `list` rule, after its indentation.
static ORDERED_LIST_ITEM: LazyLock<Regex> = LazyLock::new(|| {
  Regex::new(r"^\d{1,9}[.)](?:[ \t]|$)").expect("ORDERED_LIST_ITEM is a valid static regex pattern")
});

impl Walker<'_> {
  /// The raw HTML block right after `paragraph` that marked's paragraph rule
  /// doesn't stop at: one indented by up to three spaces, or one starting
  /// with `<?`, `<!` or `<![CDATA[`. CommonMark lets those interrupt.
  pub(super) fn html_continuation(&self, paragraph: &Node, next: Option<&Node>) -> Option<&str> {
    let (Some(paragraph), Some(Node::Html(html))) = (paragraph.position(), next) else {
      return None;
    };
    let position = html.position.as_ref()?;
    if position.start.line != paragraph.end.line + 1 {
      return None;
    }
    let raw = self
      .source
      .get(position.start.offset..position.end.offset)?;
    let continues = raw.starts_with(' ') || raw.starts_with("<?") || raw.starts_with("<!");
    continues.then_some(raw)
  }

  /// marked ends a paragraph at a line followed by a table delimiter row,
  /// even when the table that follows is invalid and CommonMark keeps the
  /// lines in one paragraph.
  pub(super) fn split_at_table_rows(&mut self, paragraph: &Node, quote_depth: usize) -> bool {
    let Some(raw) = self.raw(paragraph) else {
      return false;
    };
    let raw = self.inline(quote_depth).strip_quote_markers(raw);
    let lines: Vec<&str> = raw.split('\n').collect();
    let starts: Vec<usize> = (1..lines.len().saturating_sub(1))
      .filter(|i| TABLE_DELIMITER_ROW.is_match(lines[i + 1]))
      .collect();
    if starts.is_empty() {
      return false;
    }
    let bounds = std::iter::once(0).chain(starts.iter().copied());
    let ends = starts.iter().copied().chain(std::iter::once(lines.len()));
    let parts = bounds
      .zip(ends)
      .map(|(start, end)| lines[start..end].join("\n"));
    self.walk_parts(parts.collect(), true);
    true
  }

  /// marked lexes a list item's lines one at a time, so any ordered list
  /// marker starts a nested list there. CommonMark lets only `1.` interrupt
  /// a paragraph.
  pub(super) fn split_at_list_marker(&mut self, paragraph: &Node, quote_depth: usize) -> bool {
    let (Some(raw), Some(position)) = (self.raw(paragraph), paragraph.position()) else {
      return false;
    };
    let indent = position.start.column.saturating_sub(1);
    let lines: Vec<&str> = raw.split('\n').collect();
    let split = (1..lines.len()).find(|i| {
      let content = lines[*i].trim_start_matches(' ');
      lines[*i].len() - content.len() < indent + 4 && ORDERED_LIST_ITEM.is_match(content)
    });
    let Some(split) = split.filter(|_| quote_depth == 0) else {
      return false;
    };
    let rest: Vec<&str> = lines[split..]
      .iter()
      .map(|line| {
        let spaces = line.len() - line.trim_start_matches(' ').len();
        &line[spaces.min(indent)..]
      })
      .collect();
    self.walk_parts(vec![lines[..split].join("\n"), rest.join("\n")], false);
    true
  }

  /// Walks each part as a document of its own.
  fn walk_parts(&mut self, parts: Vec<String>, top: bool) {
    for part in parts {
      let Ok(root) = markdown::to_mdast(&part, &parse_options()) else {
        continue;
      };
      let mut walker = Walker {
        source: &part,
        definitions: self.definitions,
        budget: self.budget,
        sentences: std::mem::take(&mut self.sentences),
        block_id: self.block_id,
        depth: self.depth,
        walked_list: self.walked_list,
      };
      walker.walk_blocks(root.children().map_or(&[], Vec::as_slice), top, 0);
      self.sentences = walker.sentences;
      self.block_id = walker.block_id;
      self.walked_list = walker.walked_list;
    }
  }

  fn raw(&self, node: &Node) -> Option<&str> {
    let position = node.position()?;
    self.source.get(position.start.offset..position.end.offset)
  }
}
