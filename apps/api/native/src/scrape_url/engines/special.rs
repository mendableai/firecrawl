//! Engines that own a class of URLs. x-twitter preempts the index and its failure is the
//! scrape's failure; wikipedia runs after an index miss and falls back to the main engine.
//! A redirect the main engine follows to such a URL hands the scrape to its engine.

use tracing::{Span, field::Empty};
use url::Url;

use super::{
  super::{
    error::ScrapeURLError,
    feature_flags::{FeatureFlag, FeatureFlags},
    meta::Meta,
    options::ProxyMode,
    raw_page::{RawPage, RawPageSource, ScrapeProxy},
  },
  Engine, EngineKind, EngineOutcome,
  wikipedia::{WIKIMEDIA_URL_PATTERN, WikipediaEngine, parse_wikimedia_url},
  x_twitter::{X_TWITTER_URL_PATTERN, XTwitterEngine, parse_x_twitter_url},
};

/// The special engines a navigation can hand this scrape to, from the requested URL to
/// every redirect. Drawn once per scrape, so wikipedia's sample holds on every hop.
#[derive(Clone, Copy, Default)]
pub struct RedirectRules {
  x_twitter: Option<XTwitterEngine>,
  wikipedia: Option<WikipediaEngine>,
}

impl RedirectRules {
  /// Profile, lockdown and agentIndexOnly scrapes get no special engine, and wikipedia
  /// serves half of the scrapes it could.
  #[tracing::instrument(
    name = "RedirectRules::new",
    skip_all,
    fields(x_twitter = Empty, wikipedia = Empty)
  )]
  pub fn new(meta: &Meta) -> Self {
    let span = Span::current();
    if meta.options.profile.is_some()
      || meta.options.lockdown
      || meta.internal_options.agent_index_only
    {
      span.record("x_twitter", "excluded");
      span.record("wikipedia", "excluded");
      return Self::default();
    }
    let x_twitter = XTwitterEngine::configured();
    span.record(
      "x_twitter",
      if x_twitter.is_some() {
        "on"
      } else {
        "unconfigured"
      },
    );
    let wikipedia = if rand::random::<f64>() >= 0.5 {
      Err("sampled_out")
    } else if meta.options.proxy == ProxyMode::Enhanced
      || !meta
        .feature_flags
        .iter()
        .all(|x| WikipediaEngine::FEATURES.contains(*x))
    {
      Err("unsupported_features")
    } else {
      WikipediaEngine::configured().ok_or("unconfigured")
    };
    span.record(
      "wikipedia",
      wikipedia.map_or_else(|reason| reason, |_| "on"),
    );
    Self {
      x_twitter,
      wikipedia: wikipedia.ok(),
    }
  }

  /// The verdict on a navigation to `url`: follow it (`Ok(None)`), hand the scrape to the
  /// special engine that owns it (`Ok(Some(_))`), or stop the scrape (`Err`).
  pub fn check(&self, url: &Url) -> Result<Option<EngineKind>, ScrapeURLError> {
    Ok(if parse_x_twitter_url(url).is_some() {
      self.x_twitter.map(EngineKind::XTwitter)
    } else if parse_wikimedia_url(url).is_some() {
      self.wikipedia.map(EngineKind::Wikipedia)
    } else {
      None
    })
  }

  /// Takes `engine` out, so no later navigation hands the scrape to it again.
  pub fn remove(&mut self, engine: &EngineKind) {
    match engine {
      EngineKind::XTwitter(_) => self.x_twitter = None,
      EngineKind::Wikipedia(_) => self.wikipedia = None,
      _ => {}
    }
  }

  /// fire-engine's `abortOnUrlRegexes`: it stops before loading a navigation `check`
  /// would hand off.
  pub fn abort_patterns(&self) -> Vec<&'static str> {
    let x_twitter = self.x_twitter.map(|_| X_TWITTER_URL_PATTERN.as_str());
    let wikipedia = self.wikipedia.map(|_| WIKIMEDIA_URL_PATTERN.as_str());
    x_twitter.into_iter().chain(wikipedia).collect()
  }
}

/// The special engine that owns the requested URL. It leaves the redirect rules, so a
/// navigation back to that URL never hands off again.
#[tracing::instrument(
  name = "engines::get_special_engine",
  skip_all,
  fields(special_engine = Empty)
)]
pub fn get_special_engine(meta: &mut Meta) -> Result<Option<EngineKind>, ScrapeURLError> {
  let engine = meta.redirect_rules.check(&meta.url)?;
  if let Some(engine) = &engine {
    meta.redirect_rules.remove(engine);
  }
  Span::current().record("special_engine", engine.as_ref().map(EngineKind::get_name));
  Ok(engine)
}

/// Hands the scrape to `engine` for `url`, a navigation the main engine reached, which
/// becomes the URL the rest of the scrape works on. `None` means wikipedia fell back.
#[tracing::instrument(name = "engines::scrape_handoff", skip_all, fields(engine = engine.get_name()))]
pub async fn scrape_handoff(
  meta: &mut Meta,
  engine: EngineKind,
  url: Url,
  index_attempted: bool,
) -> Result<Option<RawPage>, ScrapeURLError> {
  meta.redirect_rules.remove(&engine);
  meta.rewritten_url = Some(url);
  scrape_special(meta, engine, index_attempted).await
}

/// The main engine's page, or the special engine's when the page landed on a URL one owns.
pub async fn hand_off_landed(meta: &mut Meta, page: RawPage) -> Result<RawPage, ScrapeURLError> {
  let Some(engine) = meta.redirect_rules.check(&page.result.url)? else {
    return Ok(page);
  };
  let url = page.result.url.clone();
  let special = scrape_handoff(meta, engine, url, page.index_attempted).await?;
  Ok(special.unwrap_or(page))
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
    Ok(EngineOutcome::ProxyElevationNeeded | EngineOutcome::Handoff { .. }) if fatal => {
      return Err(ScrapeURLError::ReliableRetrievalError(meta.options.proxy));
    }
    Err(error) => error.to_string(),
    Ok(EngineOutcome::ProxyElevationNeeded) => "proxy_elevation_needed".to_string(),
    Ok(EngineOutcome::Handoff { .. }) => "handoff".to_string(),
  };
  Span::current().record("special_engine.fallback_reason", reason);
  Ok(None)
}
