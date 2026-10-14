use tracing::instrument;

use super::{document::Document, formats::FormatKind, llm::LlmError, meta::Meta};

macro_rules! generate_execute_tranformers {
    ($($f:path),+ $(,)?) => {
        #[instrument(name = "transformers::execute_transformers", skip(meta, document), err)]
        pub async fn execute_tranformers(
          meta: &Meta,
          mut document: Document,
        ) -> Result<Document, TransformerError> {
          // rawBase64 is the untouched response body, so skip straight to coercion.
          if meta.options.formats.contains(FormatKind::RawBase64) {
            return coerce_fields_to_formats(meta, document).await;
          }
          $( document = $f(&meta, document).await?; )+
          Ok(document)
        }
    };
}

use attributes::derive_attributes_from_html;
use base64_images::remove_base64_images;
pub(super) use branding::BrandingProfile;
use branding::derive_branding_from_actions;
use clean_content::perform_clean_content;
use coerce::coerce_fields_to_formats;
use html::derive_html_from_raw_html;
use images::derive_images_from_html;
use json::perform_llm_extract;
use links::derive_links_from_html;
use markdown::derive_markdown_from_html;
use metadata::derive_metadata_from_raw_html;
use prompt_injection_guard::perform_prompt_injection_guard;
use redact_pii::perform_redact_pii;
use summary::perform_summary;
use youtube::fetch_youtube;
pub(super) use youtube::is_youtube_video_url;

mod attributes;
mod base64_images;
mod branding;
mod clean_content;
mod coerce;
mod html;
mod images;
mod json;
mod links;
mod markdown;
mod metadata;
mod prompt_injection_guard;
mod redact_pii;
mod summary;
mod tokens;
mod youtube;

#[derive(Debug, thiserror::Error)]
pub enum TransformerError {
  #[error("transformer called out of order: {0}")]
  CalledOutOfOrder(String),

  #[error("html-to-markdown conversion failed: {0}")]
  MarkdownConversion(String),

  #[error("html processing failed: {0}")]
  HtmlProcessing(String),

  #[error(transparent)]
  Reqwest(#[from] reqwest::Error),

  #[error(transparent)]
  Join(#[from] tokio::task::JoinError),

  #[error("The scraped page content is too large for JSON extraction, so extraction was aborted.")]
  JsonContentTooLarge,

  #[error("{0}")]
  PromptInjectionDetected(String),

  #[error(transparent)]
  Llm(#[from] LlmError),

  #[error("branding script returned unreadable data: {0}")]
  BrandingScriptReturn(serde_json::Error),
}

generate_execute_tranformers!(
  fetch_youtube,
  derive_html_from_raw_html,
  derive_markdown_from_html,
  perform_clean_content,
  perform_redact_pii,
  perform_prompt_injection_guard,
  derive_links_from_html,
  derive_images_from_html,
  derive_branding_from_actions,
  derive_metadata_from_raw_html,
  // TODO: fetch_product
  // TODO: fetch_menu
  // TODO: send_document_to_index
  // TODO: send_document_to_search_index
  perform_llm_extract,
  // TODO: perform_deterministic_json
  perform_summary,
  // TODO: perform_query
  derive_attributes_from_html,
  // TODO: perform_agent
  remove_base64_images,
  // TODO: derive_diff
  // TODO: fetch_audio
  // TODO: fetch_video
  coerce_fields_to_formats,
);
