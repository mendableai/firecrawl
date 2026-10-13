//! Waiting out a fire-engine job, and deleting it however the wait ends.

use std::time::Duration;

use tracing::{Instrument, Span, field::Empty, instrument};

use super::super::super::error::ScrapeURLError;
use super::{
  FireEngine,
  scrape::{FireEngineScrapeCompleted, FireEngineScrapeFailed, FireEngineScrapeResponse},
};

pub(super) type FireEngineJobResult = Result<FireEngineScrapeCompleted, FireEngineScrapeFailed>;

/// Deletes the job when dropped, so it also goes when the deadline drops the scrape mid-poll.
struct JobDeleteGuard {
  engine: FireEngine,
  job_id: String,
  finished: bool,
  span: Span,
}

impl Drop for JobDeleteGuard {
  fn drop(&mut self) {
    self
      .span
      .record("fire_engine.job_abandoned", !self.finished);
    let Ok(handle) = tokio::runtime::Handle::try_current() else {
      return;
    };
    let engine = self.engine;
    let job_id = std::mem::take(&mut self.job_id);
    handle.spawn(
      async move {
        let _ = engine.call_delete(&job_id).await;
      }
      .instrument(self.span.clone()),
    );
  }
}

impl FireEngine {
  /// The job's final result, polling while it processes. Records `fire_engine.job_id`
  /// and `fire_engine.job_abandoned` on the caller's span.
  pub(super) async fn finish_job(
    &self,
    scrape: FireEngineScrapeResponse,
  ) -> Result<FireEngineJobResult, ScrapeURLError> {
    let job_id = match &scrape {
      FireEngineScrapeResponse::Completed(x) => x.job_id.clone(),
      FireEngineScrapeResponse::Processing(x) => Some(x.job_id.clone()),
      FireEngineScrapeResponse::Failed(_) => None,
    };
    let span = Span::current();
    let mut guard = job_id.map(|job_id| {
      span.record("fire_engine.job_id", job_id.as_str());
      JobDeleteGuard {
        engine: *self,
        job_id,
        finished: false,
        span: span.clone(),
      }
    });

    let result = match scrape {
      FireEngineScrapeResponse::Completed(x) => Ok(x),
      FireEngineScrapeResponse::Failed(e) => Err(e),
      FireEngineScrapeResponse::Processing(x) => self.poll_job(&x.job_id).await?,
    };
    if let Some(guard) = guard.as_mut() {
      guard.finished = true;
    }
    Ok(result)
  }

  #[instrument(name = "FireEngine::poll_job", skip(self), fields(poll_count = Empty), err)]
  async fn poll_job(&self, job_id: &str) -> Result<FireEngineJobResult, ScrapeURLError> {
    let span = Span::current();
    let mut poll_count: u32 = 0;
    loop {
      poll_count += 1;
      span.record("poll_count", poll_count);
      match self.call_check_status(job_id).await? {
        FireEngineScrapeResponse::Completed(x) => return Ok(Ok(x)),
        FireEngineScrapeResponse::Processing(_) => {
          tokio::time::sleep(Duration::from_millis(500)).await;
        }
        FireEngineScrapeResponse::Failed(e) => return Ok(Err(e)),
      }
    }
  }
}
