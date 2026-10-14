use hegel::{TestCase, generators as gs};
use url::Url;

use super::super::{
  options::{InternalOptions, ScrapeOptions},
  timeout::DEFAULT_SCRAPE_TIMEOUT,
};
use super::Meta;

/// The engines are handed `remaining_ms`, fire-engine with the scrape cap as its fallback.
#[hegel::test]
fn remaining_ms_never_exceeds_the_timeout(tc: TestCase) {
  let mut options = ScrapeOptions::default();
  options.timeout = tc.draw(gs::optional(gs::integers::<u64>()));
  let timeout = options.timeout;
  let url = Url::parse("https://example.com/").unwrap();
  let meta = Meta::new(
    "p".into(),
    url,
    "t".into(),
    options,
    InternalOptions::default(),
  );
  let cap_ms = DEFAULT_SCRAPE_TIMEOUT.as_millis() as u64;

  let first = meta.remaining_ms();
  assert_eq!(first.is_some(), meta.deadline.is_some());
  assert!(timeout.is_some() || first.is_none());
  assert!(first.unwrap_or(cap_ms) <= timeout.unwrap_or(cap_ms));

  std::thread::sleep(std::time::Duration::from_millis(1));
  let second = meta.remaining_ms();
  assert!(second <= first, "{second:?} > {first:?}");
  if timeout == Some(0) {
    assert_eq!(second, Some(0));
  }
}
