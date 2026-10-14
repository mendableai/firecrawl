//! The SCRAPE_TIMEOUT error, and the note it carries when a large-PDF job keeps
//! processing after the scrape ran out of time.

use std::{sync::Mutex, time::Duration};

use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use tracing::Span;
use ts_rs::TS;

use super::error::ScrapeURLError;

/// How long a scrape without a `timeout` may run, like TS's engine race cap.
pub const DEFAULT_SCRAPE_TIMEOUT: Duration = Duration::from_secs(300);

const TIMEOUT_MESSAGE: &str = "The scrape operation timed out before completing. This happens when a page takes too long to load, render, or process. Possible causes: (1) The website is slow or unresponsive, (2) The page has heavy JavaScript that takes time to execute, (3) The page is very large or has many resources to load, (4) Network latency is high. To fix this, try increasing the timeout parameter in your scrape request, or if using actions, ensure your selectors are correct and the page is ready before actions are executed.";
const DEFAULT_TIMEOUT_MESSAGE: &str = "Scrape timed out due to maximum length of 5 minutes";

/// Must match fire-pdf's by-reference per-page deadline rate.
const PROCESSING_ESTIMATE_PER_PAGE_MS: i64 = 1_250;
const PROCESSING_ESTIMATE_BASE_MS: i64 = 60_000;

/// A by-reference FirePDF job this scrape submitted or adopted. Such a job outlives a
/// timed-out scrape on purpose, so the timeout error tells the caller when to retry.
#[derive(Debug, Clone)]
pub struct LargePdfProcessing {
  pub job_scrape_id: String,
  pub pages_estimate: u32,
  pub submitted_at_ms: i64,
  pub job_deadline_at_ms: Option<i64>,
  /// fire-pdf's last non-terminal status: queued, published or running.
  pub last_status: &'static str,
  pub server_estimate: Option<ServerEstimate>,
}

/// fire-pdf's live remaining estimate, and when it was observed.
#[derive(Debug, Clone, Copy)]
pub struct ServerEstimate {
  pub remaining_ms: i64,
  pub observed_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ScrapeTimeoutProcessingState {
  ProcessingContinues,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum ScrapeTimeoutJobStatus {
  Queued,
  Running,
}

/// Details of a SCRAPE_TIMEOUT whose large-PDF job keeps processing server-side.
#[skip_serializing_none]
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(optional_fields)]
pub struct ScrapeTimeoutProcessing {
  pub state: ScrapeTimeoutProcessingState,
  pub document_pages: Option<u32>,
  pub job_status: ScrapeTimeoutJobStatus,
  pub estimated_remaining_seconds: u64,
  pub retry_after_seconds: u64,
  pub may_exceed_processing_window: Option<bool>,
}

/// The error for a scrape that ran out of time. `capped` is a scrape without a `timeout`
/// hitting [`DEFAULT_SCRAPE_TIMEOUT`]. A live large-PDF job turns it into a retry note.
pub fn scrape_timeout_error(
  capped: bool,
  large_pdf_processing: &Mutex<Option<LargePdfProcessing>>,
) -> ScrapeURLError {
  let current = large_pdf_processing
    .lock()
    .ok()
    .and_then(|current| current.clone());
  let Some(current) = current else {
    let message = if capped {
      DEFAULT_TIMEOUT_MESSAGE
    } else {
      TIMEOUT_MESSAGE
    };
    return ScrapeURLError::ScrapeTimeout {
      message: message.to_string(),
      processing: None,
    };
  };
  Span::current().record("large_pdf.job_scrape_id", current.job_scrape_id.as_str());
  let (message, processing) =
    compose_timeout_processing(&current, chrono::Utc::now().timestamp_millis());
  ScrapeURLError::ScrapeTimeout {
    message,
    processing: Some(processing),
  }
}

/// Port of TS `composeTimeoutProcessing`. Estimates are conservative whole minutes.
fn compose_timeout_processing(
  current: &LargePdfProcessing,
  now_ms: i64,
) -> (String, ScrapeTimeoutProcessing) {
  let pages = Some(current.pages_estimate).filter(|x| *x > 0);
  let total_ms = pages.map_or(5 * 60_000, |pages| {
    i64::from(pages) * PROCESSING_ESTIMATE_PER_PAGE_MS + PROCESSING_ESTIMATE_BASE_MS
  });
  let remaining_ms = match current.server_estimate {
    Some(estimate) => estimate
      .remaining_ms
      .saturating_sub((now_ms - estimate.observed_at_ms).max(0)),
    None => total_ms - (now_ms - current.submitted_at_ms).max(0),
  }
  .max(60_000);
  let remaining_minutes = remaining_ms.unsigned_abs().div_ceil(60_000);
  let estimated_remaining_seconds = remaining_minutes * 60;
  let job_status = if current.last_status == "running" {
    ScrapeTimeoutJobStatus::Running
  } else {
    ScrapeTimeoutJobStatus::Queued
  };
  let may_exceed = current
    .job_deadline_at_ms
    .is_some_and(|deadline| now_ms.saturating_add(remaining_ms) > deadline);

  let doc_label = pages.map_or_else(
    || "this PDF".to_string(),
    |pages| format!("this {pages}-page PDF"),
  );
  let plural = if remaining_minutes == 1 { "" } else { "s" };
  let in_minutes = format!("~{remaining_minutes} minute{plural}");
  let message = if may_exceed {
    format!(
      "Request timed out. Note: {doc_label} is very large and may exceed the maximum server-side processing window. Retry the same URL in {in_minutes} to pick up the result if it completes; if retries keep timing out, pass a larger `timeout` or contact support to raise your document processing ceiling."
    )
  } else if job_status == ScrapeTimeoutJobStatus::Running {
    format!(
      "Request timed out, but {doc_label} is still being processed on our side. Retrying the same URL in {in_minutes} returns the completed result without re-processing. To avoid the retry entirely, pass a `timeout` that covers the estimate."
    )
  } else {
    format!(
      "Request timed out. Note: {doc_label} is queued for processing on our side and will not lose its place. Retrying the same URL in {in_minutes} returns the completed result without re-processing."
    )
  };

  let processing = ScrapeTimeoutProcessing {
    state: ScrapeTimeoutProcessingState::ProcessingContinues,
    document_pages: pages,
    job_status,
    estimated_remaining_seconds,
    retry_after_seconds: estimated_remaining_seconds.min(600),
    may_exceed_processing_window: may_exceed.then_some(true),
  };
  (message, processing)
}
