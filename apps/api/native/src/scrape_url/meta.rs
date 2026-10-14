use std::{
  collections::HashSet,
  sync::{Arc, Mutex},
  time::Duration,
};

use tokio::time::Instant;
use url::Url;

use super::cost_tracking::CostTracking;
use super::engines::RedirectRules;
use super::feature_flags::FeatureFlag;
use super::feature_flags::build_feature_flags;
use super::options::{InternalOptions, ScrapeOptions};
use super::raw_page::BrowserCookie;
use super::rewrite_url::rewrite_url;
use super::timeout::LargePdfProcessing;

#[cfg(test)]
mod properties;

pub struct Meta {
  pub id: String,
  pub url: Url,
  pub team_id: String,
  pub rewritten_url: Option<Url>,
  pub options: ScrapeOptions,
  pub internal_options: InternalOptions,
  // logger:
  /// When the scrape runs out of time; `None` when no `timeout` was given.
  pub deadline: Option<Instant>,
  pub feature_flags: HashSet<FeatureFlag>,
  /// Shared so the result can carry it after a timeout or panic drops the scrape.
  pub cost_tracking: Arc<CostTracking>,
  // winner_engine:
  /// Cookies the engine returned, for the YouTube, audio and video transformers.
  pub audio_cookies: Vec<BrowserCookie>,
  /// Shared so the timeout error can read it after the scrape future is dropped.
  pub large_pdf_processing: Arc<Mutex<Option<LargePdfProcessing>>>,
  /// The special engines a redirect can still hand the scrape to.
  pub redirect_rules: RedirectRules,
  // warnings:
}

impl Meta {
  pub fn new(
    id: String,
    url: Url,
    team_id: String,
    options: ScrapeOptions,
    internal_options: InternalOptions,
    cost_tracking: Arc<CostTracking>,
  ) -> Self {
    // NOTE: isn't this fixed by rafa?
    // let ff = build_feature_flags(&options, &internal_options);
    // if internal_options.zero_data_retention {
    //   if ff.contains(&FeatureFlag::Screenshot) {
    //     // THROW
    //   } else if ff.contains(&FeatureFlag::ScreenshotFullScreen) {
    //     // THROW
    //     //} else if options.actions. find screenshot
    //     //} else if options.actions. find pdf
    //   }
    // }

    Self {
      id,
      team_id,
      rewritten_url: rewrite_url(&url),
      url,
      deadline: options
        .timeout
        .and_then(|ms| Instant::now().checked_add(Duration::from_millis(ms))),
      feature_flags: build_feature_flags(&options, &internal_options),
      options,
      internal_options,
      cost_tracking,
      audio_cookies: Vec::new(),
      large_pdf_processing: Arc::default(),
      redirect_rules: RedirectRules::default(),
    }
  }

  /// Milliseconds left before the deadline, like TS `scrapeTimeout()`.
  pub fn remaining_ms(&self) -> Option<u64> {
    self.deadline.map(|deadline| {
      u64::try_from(
        deadline
          .saturating_duration_since(Instant::now())
          .as_millis(),
      )
      .unwrap_or(u64::MAX)
    })
  }

  pub fn get_url(&self) -> &Url {
    match self.rewritten_url.as_ref() {
      Some(x) => x,
      None => &self.url,
    }
  }

  pub fn source_url(&self) -> String {
    self
      .internal_options
      .unnormalized_source_url
      .clone()
      .unwrap_or_else(|| self.url.to_string())
  }
}
