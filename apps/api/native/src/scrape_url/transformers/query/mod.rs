//! Port of TS `transformers/query.ts`: the `question` and `query` formats'
//! answer and the `highlights` format.

use tracing::instrument;

use super::super::{
  document::Document, formats::Format, formats::FormatKind, formats::QueryMode, meta::Meta,
};
use super::TransformerError;
use direct_quote::direct_quote;
use freeform::freeform;

mod direct_quote;
mod fit;
mod freeform;
mod highlight_spans;
mod providers;

#[derive(Debug, Clone, Copy)]
enum Purpose {
  Query,
  Highlights,
}

impl Purpose {
  /// TS's telemetry `functionId` for a direct quote call.
  fn function_id(self) -> &'static str {
    match self {
      Purpose::Query => "performQuery/directQuote",
      Purpose::Highlights => "performQuery/highlights",
    }
  }
}

fn too_long_warning(purpose: Purpose) -> &'static str {
  match purpose {
    Purpose::Highlights => {
      "The page was too long to process in full; highlights were generated from the first part of it."
    }
    Purpose::Query => {
      "The page was too long to process in full; the answer was generated from the first part of it."
    }
  }
}

/// TS `performQuery`.
#[instrument(name = "transformers::query::perform_query", skip(meta, document), err)]
pub async fn perform_query(
  meta: &Meta,
  mut document: Document,
) -> Result<Document, TransformerError> {
  let formats = &meta.options.formats;
  let answer_format = formats
    .get(FormatKind::Question)
    .or_else(|| formats.get(FormatKind::Query));
  let highlights = match formats.get(FormatKind::Highlights) {
    Some(Format::Highlights(x)) => Some(x.query.as_str()),
    _ => None,
  };
  if answer_format.is_none() && highlights.is_none() {
    return Ok(document);
  }

  if meta.internal_options.zero_data_retention {
    document.prepend_warning("Query mode is not supported with zero data retention.");
    return Ok(document);
  }
  let Some(markdown) = document.markdown.clone() else {
    document.prepend_warning("Query mode is not supported without markdown content.");
    return Ok(document);
  };
  if highlight_spans::js_trim(&markdown).is_empty() {
    document.prepend_warning("Query was skipped because the markdown content is empty.");
    return Ok(document);
  }

  let answer = match answer_format {
    Some(Format::Question(x)) => Some(freeform(meta, &mut document, &x.question, &markdown).await?),
    Some(Format::Query(x)) if x.mode == QueryMode::DirectQuote => {
      Some(direct_quote(meta, &mut document, &x.prompt, &markdown, Purpose::Query).await?)
    }
    Some(Format::Query(x)) => Some(freeform(meta, &mut document, &x.prompt, &markdown).await?),
    _ => None,
  };
  match answer {
    Some(Some(answer)) => document.answer = Some(answer),
    Some(None) => document.prepend_warning("Query generation failed after all models."),
    None => {}
  }

  if let Some(query) = highlights {
    match direct_quote(meta, &mut document, query, &markdown, Purpose::Highlights).await? {
      Some(highlights) => document.highlights = Some(highlights),
      None => document.prepend_warning("Highlights generation failed after all models."),
    }
  }
  Ok(document)
}
