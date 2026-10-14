//! Deadline math and poll cadence for fire-pdf async jobs.

/// `deadline_at - now` must fall in `[MIN_DEADLINE_MS, MAX_DEADLINE_MS]` per the /jobs contract.
pub const MIN_DEADLINE_MS: i64 = 5_000;
pub const MAX_DEADLINE_MS: i64 = 30 * 60 * 1_000;
pub const POLL_FLOOR_MS: i64 = 1_000;
pub const POLL_CAP_MS: i64 = 5_000;

/// A `wait_ms` shorter than this is not worth holding a connection for.
const LONG_POLL_MIN_WAIT_MS: i64 = 1_000;
/// fire-pdf clamps longer waits, so asking for more would make a held answer look early.
const LONG_POLL_MAX_WAIT_MS: i64 = 25_000;
const LONG_POLL_DEADLINE_SLACK_MS: i64 = 1_000;
/// A non-terminal answer faster than this fraction of `wait_ms` was not held.
pub const LONG_POLL_HELD_FRACTION: f64 = 0.5;
/// Early answers in a row after which the job stays on the regular schedule.
pub const LONG_POLL_MAX_EARLY_ANSWERS: u32 = 2;

/// Polling budget past the caller window, on top of the worker's own expiry handling.
pub const POLL_TIMEOUT_BUFFER_MS: i64 = 30_000;

/// An inline job's deadline sits this far inside the caller window, so the
/// worker's deadline-degraded result is written and fetched before the caller gives up.
const INLINE_JOB_DEADLINE_MARGIN_FRACTION: f64 = 0.1;
const INLINE_JOB_DEADLINE_MARGIN_MIN_MS: i64 = 10_000;
const INLINE_JOB_DEADLINE_MARGIN_MAX_MS: i64 = 30_000;
/// Polls are pulled forward to land this long after the job deadline.
const JOB_DEADLINE_POLL_GRACE_MS: i64 = 1_000;

pub const SUBMIT_TRANSIENT_RETRY_DELAY_MS: i64 = 250;
/// fire-pdf validates `deadline_at - now` on arrival, so the deadline must clear the minimum by the flight time.
const INLINE_SUBMIT_SLACK_MS: i64 = 5_000;
/// The smallest caller window async accepts; below it the inline job deadline would be rejected on arrival.
pub const MIN_ASYNC_CALLER_WINDOW_MS: i64 =
  MIN_DEADLINE_MS + INLINE_JOB_DEADLINE_MARGIN_MIN_MS + INLINE_SUBMIT_SLACK_MS;

/// Usable window of a scrape with no deadline.
const DEFAULT_CALLER_WINDOW_MS: i64 = 5 * 60 * 1_000;

/// Worst-case by-reference rate (scanned OCR p90) and a base that absorbs burst queue wait.
const BY_REFERENCE_DEADLINE_PER_PAGE_MS: i64 = 1_250;
const BY_REFERENCE_DEADLINE_BASE_MS: i64 = 10 * 60 * 1_000;

fn round(x: f64) -> i64 {
  x.round() as i64
}

/// Exponential backoff from the floor with +0-20% jitter, capped; fire-pdf's hint is a floor.
pub fn next_poll_delay(prev: i64, retry_after_ms: Option<i64>, random: f64) -> i64 {
  let candidate = prev
    .saturating_mul(2)
    .max(retry_after_ms.unwrap_or(0))
    .max(POLL_FLOOR_MS);
  POLL_CAP_MS.min(round(candidate as f64 * (1.0 + random * 0.2)))
}

/// Deadline for an inline job: the caller window minus a margin, never below fire-pdf's minimum.
pub fn compute_inline_job_deadline_ms(caller_window_ms: i64) -> i64 {
  let margin = round(caller_window_ms as f64 * INLINE_JOB_DEADLINE_MARGIN_FRACTION).clamp(
    INLINE_JOB_DEADLINE_MARGIN_MIN_MS,
    INLINE_JOB_DEADLINE_MARGIN_MAX_MS,
  );
  MIN_DEADLINE_MS.max(caller_window_ms.saturating_sub(margin))
}

/// Caps a poll delay so a poll lands just after the job deadline, and polls at the floor past it.
pub fn align_poll_delay(delay_ms: i64, now_ms: i64, job_deadline_at_ms: Option<i64>) -> i64 {
  let Some(job_deadline_at_ms) = job_deadline_at_ms else {
    return delay_ms;
  };
  let until_target = job_deadline_at_ms
    .saturating_add(JOB_DEADLINE_POLL_GRACE_MS)
    .saturating_sub(now_ms);
  if until_target <= 0 {
    delay_ms.min(POLL_FLOOR_MS)
  } else {
    delay_ms.min(POLL_FLOOR_MS.max(until_target))
  }
}

/// The caller window: the remaining scrape budget, or 5 minutes without one, capped at fire-pdf's maximum.
pub fn compute_deadline_ms(remaining_ms: Option<i64>) -> i64 {
  remaining_ms
    .unwrap_or(DEFAULT_CALLER_WINDOW_MS)
    .clamp(0, MAX_DEADLINE_MS)
}

/// By-reference job deadline: page-scaled, never below the caller window, capped at fire-pdf's maximum.
pub fn compute_by_reference_deadline_ms(remaining_ms: Option<i64>, pages_estimate: u32) -> i64 {
  let page_scaled =
    BY_REFERENCE_DEADLINE_BASE_MS + i64::from(pages_estimate) * BY_REFERENCE_DEADLINE_PER_PAGE_MS;
  MAX_DEADLINE_MS.min(compute_deadline_ms(remaining_ms).max(page_scaled))
}

/// The `wait_ms` to send now, bounded by the polling deadline, or 0 when too little time is left.
pub fn long_poll_wait_for(configured_ms: i64, ms_until_deadline: i64) -> i64 {
  let wait = configured_ms
    .min(LONG_POLL_MAX_WAIT_MS)
    .min(ms_until_deadline.saturating_sub(LONG_POLL_DEADLINE_SLACK_MS));
  if wait >= LONG_POLL_MIN_WAIT_MS {
    wait
  } else {
    0
  }
}

struct PipelineBucket {
  /// Inclusive upper bound of the page estimate this row applies to.
  max_pages: u32,
  /// Typical pipeline time: where the first poll lands.
  p50_ms: i64,
  /// Slow-tail pipeline time: where fast polling stops.
  p90_ms: i64,
}

const PIPELINE_BUCKETS: [PipelineBucket; 6] = [
  PipelineBucket {
    max_pages: 1,
    p50_ms: 1_000,
    p90_ms: 3_000,
  },
  PipelineBucket {
    max_pages: 5,
    p50_ms: 1_200,
    p90_ms: 5_000,
  },
  PipelineBucket {
    max_pages: 10,
    p50_ms: 2_500,
    p90_ms: 9_700,
  },
  PipelineBucket {
    max_pages: 25,
    p50_ms: 4_400,
    p90_ms: 14_900,
  },
  PipelineBucket {
    max_pages: 50,
    p50_ms: 5_200,
    p90_ms: 19_500,
  },
  PipelineBucket {
    max_pages: 100,
    p50_ms: 11_800,
    p90_ms: 31_000,
  },
];

const FAST_POLL_MS: i64 = 300;
const EARLY_POLL_JITTER: f64 = 0.2;
const MIN_EARLY_POLL_MS: i64 = 250;
/// Bounds the extra requests one job can cause, however long its tail.
const MAX_FAST_POLLS: u32 = 30;

pub struct EarlyPollState {
  pub pages_estimate: u32,
  /// Time since polling began.
  pub elapsed_ms: i64,
  /// Polls already sent (the first poll is number 0).
  pub poll_count: u32,
  /// Polls already sent on the fast interval.
  pub fast_poll_count: u32,
  /// fire-pdf's own requested delay; wins whenever it is larger.
  pub retry_after_ms: Option<i64>,
  pub random: f64,
}

/// Delay before the next poll while a job with a known page count is inside its
/// expected pipeline window, or `None` once the regular backoff takes over.
pub fn early_poll_delay(state: &EarlyPollState) -> Option<i64> {
  if state.pages_estimate == 0 {
    return None;
  }
  let bucket = PIPELINE_BUCKETS
    .iter()
    .find(|b| state.pages_estimate <= b.max_pages)?;

  let base = if state.poll_count == 0 {
    bucket.p50_ms
  } else if state.elapsed_ms < bucket.p90_ms && state.fast_poll_count < MAX_FAST_POLLS {
    FAST_POLL_MS
  } else {
    return None;
  };
  let jittered = round(base as f64 * (1.0 + state.random * EARLY_POLL_JITTER));
  let hint = POLL_CAP_MS.min(state.retry_after_ms.unwrap_or(0));
  Some(MIN_EARLY_POLL_MS.max(jittered).max(hint))
}

#[cfg(test)]
mod tests {
  use std::time::Duration;

  use hegel::TestCase;
  use hegel::generators as gs;
  use tokio::time::Instant;
  use url::Url;

  use super::super::super::limits::ensure_ocr_time;
  use super::super::super::super::super::{
    meta::Meta,
    options::{InternalOptions, ScrapeOptions},
    timeout::{LargePdfProcessing, ServerEstimate, compose_timeout_processing},
  };
  use super::super::FirePdfRequest;
  use super::*;

  #[hegel::test]
  fn remaining_ms_and_fire_engine_poll_budget_never_exceed_deadline(tc: TestCase) {
    let timeout_ms = tc.draw(gs::optional(
      gs::integers::<u64>().min_value(1).max_value(60_000),
    ));
    let past_offset_ms = tc.draw(gs::optional(
      gs::integers::<u64>().min_value(0).max_value(86_400_000),
    ));
    let deadline_epoch = tc.draw(gs::optional(gs::integers::<i64>()));
    let now_epoch = tc.draw(gs::integers::<i64>());

    let rt = tokio::runtime::Builder::new_current_thread()
      .enable_time()
      .start_paused(true)
      .build()
      .expect("tokio runtime");

    rt.block_on(async {
      let mut options = ScrapeOptions::default();
      options.timeout = timeout_ms;
      let mut meta = Meta::new(
        "test-id".to_string(),
        Url::parse("https://example.com").expect("valid static URL"),
        "test-team".to_string(),
        options,
        InternalOptions::default(),
      );

      if let Some(rem) = meta.remaining_ms() {
        let configured = timeout_ms.expect("timeout set");
        assert!(rem <= configured, "remaining_ms {rem} exceeded timeout {configured}");
        let fe_timeout = meta.remaining_ms().unwrap_or(300_000);
        assert!(fe_timeout <= configured);
      }

      if let Some(deadline) = meta.deadline {
        let _ = tokio::time::timeout_at(deadline, async {
          loop {
            if let Some(rem) = meta.remaining_ms() {
              assert!(rem <= timeout_ms.unwrap_or(u64::MAX));
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
          }
        })
        .await;
        assert!(Instant::now() <= deadline);
        assert_eq!(meta.remaining_ms(), Some(0));
      }

      if let Some(past_ms) = past_offset_ms {
        meta.deadline = Instant::now().checked_sub(Duration::from_millis(past_ms));
        if let Some(rem) = meta.remaining_ms() {
          assert_eq!(rem, 0, "expired deadline must have 0 remaining_ms");
        }
      }

      let req = FirePdfRequest::from_meta(&meta, deadline_epoch);
      if let Some(rem) = req.remaining_ms(now_epoch) {
        assert!(
          rem >= 0,
          "FirePdfRequest::remaining_ms must never be negative, got {rem}"
        );
      }
    });
  }

  #[hegel::test]
  fn firepdf_poll_budgets_never_schedule_past_deadline(tc: TestCase) {
    let remaining_ms = tc.draw(gs::optional(gs::integers::<i64>().min_value(0)));
    let caller_window_ms = tc.draw(gs::integers::<i64>());
    let pages_estimate = tc.draw(gs::integers::<u32>());
    let configured_wait_ms = tc.draw(gs::integers::<i64>());
    let ms_until_deadline = tc.draw(gs::integers::<i64>());
    let prev_delay = tc.draw(gs::integers::<i64>());
    let retry_after_ms = tc.draw(gs::optional(gs::integers::<i64>()));
    let random = tc.draw(gs::floats::<f64>().min_value(0.0).max_value(1.0));
    let now_ms = tc.draw(gs::integers::<i64>());
    let polling_deadline = tc.draw(gs::integers::<i64>());
    let job_deadline_at_ms = tc.draw(gs::optional(gs::integers::<i64>()));
    let elapsed_ms = tc.draw(gs::integers::<i64>());
    let poll_count = tc.draw(gs::integers::<u32>());
    let fast_poll_count = tc.draw(gs::integers::<u32>());

    let window = compute_deadline_ms(remaining_ms);
    assert!((0..=MAX_DEADLINE_MS).contains(&window));
    if let Some(rem) = remaining_ms {
      assert!(window <= rem);
    }

    let inline_deadline = compute_inline_job_deadline_ms(caller_window_ms);
    assert!(inline_deadline >= MIN_DEADLINE_MS);
    if caller_window_ms >= MIN_ASYNC_CALLER_WINDOW_MS {
      assert!(inline_deadline <= caller_window_ms);
    }

    let by_ref_deadline = compute_by_reference_deadline_ms(remaining_ms, pages_estimate);
    assert!((0..=MAX_DEADLINE_MS).contains(&by_ref_deadline));

    let wait_ms = long_poll_wait_for(configured_wait_ms, ms_until_deadline);
    assert!(wait_ms >= 0);
    if ms_until_deadline <= 0 {
      assert_eq!(wait_ms, 0);
    } else {
      assert!(wait_ms <= ms_until_deadline);
    }

    let backoff = next_poll_delay(prev_delay, retry_after_ms, random);
    assert!((POLL_FLOOR_MS..=POLL_CAP_MS).contains(&backoff));

    let early = early_poll_delay(&EarlyPollState {
      pages_estimate,
      elapsed_ms,
      poll_count,
      fast_poll_count,
      retry_after_ms,
      random,
    });
    if let Some(early_ms) = early {
      assert!(early_ms >= MIN_EARLY_POLL_MS);
    }

    let aligned = align_poll_delay(early.unwrap_or(backoff), now_ms, job_deadline_at_ms);
    let scheduled_delay = aligned.min(polling_deadline.saturating_sub(now_ms).max(0));
    assert!(scheduled_delay >= 0);
    if now_ms <= polling_deadline {
      assert!(now_ms.saturating_add(scheduled_delay) <= polling_deadline);
    }

    let _ = ensure_ocr_time(pages_estimate, job_deadline_at_ms, now_ms);
  }

  #[hegel::test]
  fn timeout_processing_math_never_panics_or_goes_negative(tc: TestCase) {
    let pages_estimate = tc.draw(gs::integers::<u32>());
    let submitted_at_ms = tc.draw(gs::integers::<i64>());
    let job_deadline_at_ms = tc.draw(gs::optional(gs::integers::<i64>()));
    let running = tc.draw(gs::booleans());
    let has_server_estimate = tc.draw(gs::booleans());
    let server_remaining_ms = tc.draw(gs::integers::<i64>());
    let observed_at_ms = tc.draw(gs::integers::<i64>());
    let now_ms = tc.draw(gs::integers::<i64>());

    let current = LargePdfProcessing {
      job_scrape_id: "job-1".to_string(),
      pages_estimate,
      submitted_at_ms,
      job_deadline_at_ms,
      last_status: if running { "running" } else { "queued" },
      server_estimate: has_server_estimate.then_some(ServerEstimate {
        remaining_ms: server_remaining_ms,
        observed_at_ms,
      }),
    };

    let (message, processing) = compose_timeout_processing(&current, now_ms);
    assert!(!message.is_empty());
    assert!(processing.estimated_remaining_seconds >= 60);
    assert!(processing.retry_after_seconds >= 60 && processing.retry_after_seconds <= 600);
  }
}

