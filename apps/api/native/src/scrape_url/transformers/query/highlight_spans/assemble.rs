use std::collections::{BTreeSet, HashSet};

use super::{Sentence, SentenceSource};

/// TS `assembleAnswer`: the selected spans as markdown. A selected table row
/// pulls in its header and rebuilds the table, consecutive code spans
/// rebuild a fenced block, and same-block text spans rejoin into a paragraph.
pub fn assemble_answer(sentences: &[Sentence], indices: &[usize]) -> String {
  let mut selected: BTreeSet<usize> = indices
    .iter()
    .copied()
    .filter(|i| *i < sentences.len())
    .collect();
  let mut header_included = HashSet::new();
  for s in selected.clone().iter().filter_map(|i| sentences.get(*i)) {
    if s.source != SentenceSource::Table || s.is_header || header_included.contains(&s.block_id) {
      continue;
    }
    if let Some(header) = sentences
      .iter()
      .position(|h| h.block_id == s.block_id && h.is_header)
    {
      selected.insert(header);
      header_included.insert(s.block_id);
    }
  }

  let mut out = Assembly::default();
  let mut prev: Option<&Sentence> = None;
  for cur in selected.iter().filter_map(|i| sentences.get(*i)) {
    let same_prev_block =
      prev.is_some_and(|p| p.block_id == cur.block_id && p.source == cur.source);
    prev = Some(cur);
    match cur.source {
      SentenceSource::Code => {
        out.flush_table();
        match out.code_run.as_mut() {
          Some((texts, _)) if same_prev_block => texts.push(cur.text.clone()),
          _ => {
            out.flush_code();
            out.code_run = Some((vec![cur.text.clone()], cur.lang.clone()));
          }
        }
      }
      SentenceSource::Table => {
        out.flush_code();
        match out.table_rows.as_mut() {
          Some(rows) if same_prev_block => append_table_row(rows, cur),
          _ => {
            out.flush_table();
            let mut rows = Vec::new();
            append_table_row(&mut rows, cur);
            out.table_rows = Some(rows);
          }
        }
      }
      SentenceSource::Heading | SentenceSource::Text => {
        out.flush_code();
        out.flush_table();
        match out.parts.last_mut() {
          Some(last) if same_prev_block => {
            last.push(' ');
            last.push_str(&cur.text);
          }
          _ => out.parts.push(cur.text.clone()),
        }
      }
    }
  }
  out.flush_code();
  out.flush_table();
  out.parts.join("\n\n")
}

#[derive(Default)]
struct Assembly {
  parts: Vec<String>,
  code_run: Option<(Vec<String>, Option<String>)>,
  table_rows: Option<Vec<String>>,
}

impl Assembly {
  fn flush_code(&mut self) {
    let Some((texts, lang)) = self.code_run.take() else {
      return;
    };
    let fence = format!("```{}", lang.unwrap_or_default());
    self
      .parts
      .push(format!("{fence}\n{}\n```", texts.join("\n")));
  }

  fn flush_table(&mut self) {
    if let Some(rows) = self.table_rows.take() {
      self.parts.push(rows.join("\n"));
    }
  }
}

/// TS `startTable` and `appendTableRow`: a header goes first, followed by
/// the delimiter row.
fn append_table_row(rows: &mut Vec<String>, cur: &Sentence) {
  if !cur.is_header {
    rows.push(format!("| {} |", cur.text));
    return;
  }
  let cols: Vec<&str> = cur.text.split(" | ").collect();
  let escaped: Vec<String> = cols.iter().map(|c| c.replace('*', "\\*")).collect();
  let delimiter = vec!["---"; cols.len()].join(" | ");
  rows.insert(0, format!("| {} |", escaped.join(" | ")));
  rows.insert(1, format!("| {delimiter} |"));
}
