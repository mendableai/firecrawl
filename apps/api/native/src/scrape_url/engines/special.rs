//! Engines that own a class of URLs. x-twitter preempts the index and its failure is the
//! scrape's failure; wikipedia runs after an index miss and falls back to the main engine.

use tracing::{Span, field::Empty};

use super::{
  super::{
    error::ScrapeURLError,
    feature_flags::{FeatureFlag, FeatureFlags},
    meta::Meta,
    options::ProxyMode,
    raw_page::{RawPage, RawPageSource, ScrapeProxy},
  },
  Engine, EngineKind, EngineOutcome,
  wikipedia::{WikipediaEngine, parse_wikimedia_url},
  x_twitter::{XTwitterEngine, parse_x_twitter_url},
};

/// The special engine for this scrape, if any. Profile, lockdown and agentIndexOnly
/// scrapes never get one, and wikipedia serves half of the requests it could.
#[tracing::instrument(
  name = "engines::get_special_engine",
  skip_all,
  fields(special_engine = Empty, special_engine.skipped = Empty)
)]
pub async fn get_special_engine(meta: &Meta) -> Option<EngineKind> {
  if meta.options.profile.is_some()
    || meta.options.lockdown
    || meta.internal_options.agent_index_only
  {
    return None;
  }
  let span = Span::current();
  let engine = if parse_x_twitter_url(&meta.url).is_some() {
    XTwitterEngine::get().await
  } else if parse_wikimedia_url(&meta.url).is_none() {
    None
  } else if rand::random::<f64>() >= 0.5 {
    span.record("special_engine.skipped", "sampled_out");
    None
  } else if meta.options.proxy == ProxyMode::Enhanced
    || !meta
      .feature_flags
      .iter()
      .all(|x| WikipediaEngine::FEATURES.contains(*x))
  {
    span.record("special_engine.skipped", "unsupported_features");
    None
  } else {
    WikipediaEngine::get().await
  };
  span.record("special_engine", engine.as_ref().map(EngineKind::get_name));
  engine
}

/// Whether the engine runs before the index is consulted.
pub fn preempts_index(engine: Option<&EngineKind>) -> bool {
  matches!(engine, Some(EngineKind::XTwitter(_)))
}

/// Scrapes with the special engine. `None` means wikipedia failed and the main engine
/// takes over; x-twitter's errors are returned as they are.
#[tracing::instrument(
  name = "engines::scrape_special",
  skip_all,
  fields(engine = engine.get_name(), special_engine.fallback_reason = Empty)
)]
pub async fn scrape_special(
  meta: &Meta,
  engine: EngineKind,
  index_attempted: bool,
) -> Result<Option<RawPage>, ScrapeURLError> {
  let features = engine.get_features();
  if meta.feature_flags.contains(&FeatureFlag::Actions) && !features.contains(FeatureFlag::Actions)
  {
    return Err(ScrapeURLError::ActionsNotSupportedError);
  }
  let fatal = preempts_index(Some(&engine));
  // Boxed, as the nested engine futures otherwise exceed the compiler's layout depth.
  let reason = match Box::pin(engine.scrape(meta, ScrapeProxy::Basic)).await {
    Ok(EngineOutcome::Scraped(result)) => {
      let unsupported: FeatureFlags = meta
        .feature_flags
        .iter()
        .filter(|x| !features.contains(**x))
        .copied()
        .collect();
      return Ok(Some(RawPage {
        source: RawPageSource::Engine(engine, unsupported),
        result,
        index_attempted,
      }));
    }
    Err(error) if fatal => return Err(error),
    Ok(EngineOutcome::ProxyElevationNeeded) if fatal => {
      return Err(ScrapeURLError::ReliableRetrievalError(meta.options.proxy));
    }
    Err(error) => error.to_string(),
    Ok(EngineOutcome::ProxyElevationNeeded) => "proxy_elevation_needed".to_string(),
  };
  Span::current().record("special_engine.fallback_reason", reason);
  Ok(None)
}
