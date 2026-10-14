//! Port of TS `lib/fire-privacy-chunker.ts`, in UTF-16 units like JS strings.

/// Headroom below fire-privacy's 32K-char model input so the split search can
/// walk back to a paragraph break. 28,000 UTF-16 units are at most 84,000
/// UTF-8 bytes, under TS's 95,000-byte budget, so its byte shrink never runs.
const MAX_CHARS: usize = 28_000;

pub struct Chunk {
  pub text: Vec<u16>,
  pub start: usize,
}

/// Non-overlapping chunks that concatenate back to `text`, split at the
/// latest paragraph, line, sentence or word break in the upper half of each window.
pub fn chunk_markdown(text: &[u16]) -> Vec<Chunk> {
  let mut chunks = Vec::new();
  let mut cursor = 0;
  while cursor < text.len() {
    let tentative_end = (cursor + MAX_CHARS).min(text.len());
    let mut safe_end = tentative_end;
    if tentative_end < text.len() {
      safe_end = find_safe_split(text, cursor + MAX_CHARS / 2, tentative_end);
      if safe_end <= cursor {
        safe_end = tentative_end;
      }
      // Chunks are sent as strings, so a hard cut must not split a surrogate pair.
      if (0xD800..=0xDBFF).contains(&text[safe_end - 1]) {
        safe_end -= 1;
      }
    }
    chunks.push(Chunk {
      text: text[cursor..safe_end].to_vec(),
      start: cursor,
    });
    cursor = safe_end;
  }
  chunks
}

/// TS `findSafeSplit`: the latest safe index in `text[lo..hi]`, or `hi`.
fn find_safe_split(text: &[u16], lo: usize, hi: usize) -> usize {
  let window = &text[lo..hi];
  let is = |i: usize, c: char| window.get(i) == Some(&(c as u16));

  let last = |pattern: &dyn Fn(usize) -> bool| (1..window.len()).rev().find(|&i| pattern(i));
  if let Some(i) = last(&|i| is(i, '\n') && is(i + 1, '\n')) {
    return lo + i + 2;
  }
  if let Some(i) = last(&|i| is(i, '\n')) {
    return lo + i + 1;
  }
  let sentence_end = (0..window.len().saturating_sub(1))
    .rev()
    .find(|&i| matches!(window[i], 0x2e | 0x21 | 0x3f) && is_js_whitespace(window[i + 1]));
  if let Some(i) = sentence_end {
    return lo + i + 2;
  }
  if let Some(i) = last(&|i| is(i, ' ')) {
    return lo + i + 1;
  }
  hi
}

/// JS regex `\s`.
fn is_js_whitespace(unit: u16) -> bool {
  matches!(
    unit,
    0x09..=0x0d
      | 0x20
      | 0xa0
      | 0x1680
      | 0x2000..=0x200a
      | 0x2028
      | 0x2029
      | 0x202f
      | 0x205f
      | 0x3000
      | 0xfeff
  )
}
