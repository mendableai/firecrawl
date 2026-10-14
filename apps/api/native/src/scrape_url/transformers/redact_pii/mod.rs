//! TS `performRedactPII` and the fire-privacy client's `redactText`.

use std::sync::Arc;

use tokio::{sync::Semaphore, task::JoinSet};
use tracing::{Instrument, Span, field::Empty, instrument};

use super::super::{
  document::Document,
  meta::Meta,
  options::{RedactPiiOptions, RedactPiiReplaceStyle},
};
use super::TransformerError;
use client::{ChunkResult, FIRE_PRIVACY_URL, RedactionSpan, redact_once};

mod chunker;
mod client;

/// Above this many UTF-8 bytes TS refuses to redact rather than ship partial results.
const MAX_REDACT_BYTES: usize = 250_000;
/// Keeps one call under half of the fire-privacy fleet.
const CHUNK_CONCURRENCY: usize = 3;

/// Swaps the markdown for its redacted copy. Fails closed: when redaction
/// fails or is refused, the markdown becomes empty.
#[instrument(
  name = "transformers::redact_pii::perform_redact_pii",
  skip(meta, document),
  fields(status = Empty, reason = Empty, chunks = Empty, spans = Empty),
  err
)]
pub async fn perform_redact_pii(
  meta: &Meta,
  mut document: Document,
) -> Result<Document, TransformerError> {
  let Some(options) = meta.options.redact_pii.as_ref() else {
    return Ok(document);
  };
  let Some(markdown) = document.markdown.as_deref() else {
    document.markdown = Some(String::new());
    return Ok(document);
  };

  document.markdown = Some(redact_text(markdown, options).await?.unwrap_or_default());
  Ok(document)
}

/// TS `redactText`'s `redactedMarkdown`: `None` when redaction failed or was refused.
async fn redact_text(
  text: &str,
  options: &RedactPiiOptions,
) -> Result<Option<String>, TransformerError> {
  let span = Span::current();
  let outcome = |status: &str, reason: Option<&str>| {
    span.record("status", status);
    span.record("reason", reason);
  };

  let Some(base_url) = FIRE_PRIVACY_URL.as_deref() else {
    outcome("failed", Some("error"));
    return Ok(None);
  };
  if text.trim().is_empty() {
    outcome("skipped", Some("empty_input"));
    return Ok(Some(text.to_string()));
  }
  if text.len() > MAX_REDACT_BYTES {
    outcome("skipped", Some("too_large"));
    return Ok(None);
  }

  let units: Vec<u16> = text.encode_utf16().collect();
  let chunks = chunker::chunk_markdown(&units);
  span.record("chunks", chunks.len());
  let results = run_chunks(base_url, chunks, options).await?;

  // All or nothing: partial redaction can't tell callers which parts are clean.
  let mut all_spans = Vec::new();
  let mut redacted = String::new();
  let mut upstream_skipped = false;
  for result in results {
    match result {
      ChunkResult::Failed(reason) => {
        outcome("failed", Some(reason));
        return Ok(None);
      }
      ChunkResult::Ok {
        spans,
        redacted_text,
        upstream_skipped: skipped,
      } => {
        all_spans.extend(spans);
        redacted.push_str(&redacted_text);
        upstream_skipped |= skipped;
      }
    }
  }

  let total = all_spans.len();
  let spans: Vec<RedactionSpan> = match options.entities.as_deref() {
    Some(entities) if !entities.is_empty() => all_spans
      .into_iter()
      .filter(|x| x.entity.is_some_and(|e| entities.contains(&e)))
      .collect(),
    _ => all_spans,
  };
  span.record("spans", spans.len());
  if spans.len() != total {
    redacted = render_redacted(&units, spans, options.replace_style);
  }

  if upstream_skipped {
    outcome("skipped", Some("upstream_skipped"));
  } else {
    outcome("ok", None);
  }
  Ok(Some(redacted))
}

/// TS `runChunks`: every chunk's result in chunk order, three calls at a time.
async fn run_chunks(
  base_url: &str,
  chunks: Vec<chunker::Chunk>,
  options: &RedactPiiOptions,
) -> Result<Vec<ChunkResult>, TransformerError> {
  let permits = Arc::new(Semaphore::new(CHUNK_CONCURRENCY));
  let mut calls = JoinSet::new();
  for (index, chunk) in chunks.into_iter().enumerate() {
    let (base_url, options, permits) = (base_url.to_string(), options.clone(), permits.clone());
    let call = async move {
      let _permit = permits.acquire_owned().await;
      let text = String::from_utf16_lossy(&chunk.text);
      (
        index,
        redact_once(&base_url, text, chunk.start, &options).await,
      )
    };
    calls.spawn(call.in_current_span());
  }

  let mut results: Vec<Option<ChunkResult>> = (0..calls.len()).map(|_| None).collect();
  while let Some(joined) = calls.join_next().await {
    let (index, result) = joined?;
    results[index] = Some(result);
  }
  Ok(results.into_iter().flatten().collect())
}

/// TS `renderRedacted`: the text with only the kept spans replaced, for when
/// the entity filter dropped some of fire-privacy's spans.
fn render_redacted(
  text: &[u16],
  mut spans: Vec<RedactionSpan>,
  replace_style: RedactPiiReplaceStyle,
) -> String {
  spans.sort_by_key(|x| x.start);
  let len = text.len() as i64;
  let mut out: Vec<u16> = Vec::with_capacity(text.len());
  let mut cursor: i64 = 0;
  for span in spans {
    if span.start < cursor {
      continue;
    }
    if span.start > len {
      break;
    }
    out.extend_from_slice(&text[cursor as usize..span.start as usize]);
    match replace_style {
      RedactPiiReplaceStyle::Tag => out.extend(format!("<{}>", span.kind).encode_utf16()),
      RedactPiiReplaceStyle::Mask => out.extend(std::iter::repeat_n(
        u16::from(b'*'),
        (span.end - span.start).max(0) as usize,
      )),
      RedactPiiReplaceStyle::Remove => {}
    }
    cursor = span.end.clamp(0, len);
  }
  out.extend_from_slice(&text[cursor as usize..]);
  String::from_utf16_lossy(&out)
}
