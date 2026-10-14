use std::sync::{LazyLock, OnceLock};

use regex::Regex;
use tracing::instrument;

use self::{
  actions::{FireEngineActionResultKind, parse_javascript_return},
  branding::branding_action,
  scrape::{FireEngineProfile, FireEngineScrapeRequest, FireEngineScrapeRequestEngine},
};
use super::super::{
  actions::{Action, InternalAction, InternalActionMetadata, WaitAction},
  error::ScrapeURLError,
  feature_flags::{ConstFeatureFlags, FeatureFlag},
  formats::FormatKind,
  meta::Meta,
  options::ProxyMode,
  parsers::fire_engine_pdf_max_size,
  raw_page::{
    JavascriptActionContent, RawPageActions, RawPageContent, RawPageResult, ScrapeProxy,
  },
  transformers::is_youtube_video_url,
};
use super::{Engine, EngineOutcome};

mod actions;
mod branding;
mod check_status;
mod delete;
mod file;
mod poll;
mod scrape;

static FIRE_ENGINE_BETA_URL: LazyLock<Option<String>> = LazyLock::new(|| {
  if let Some(url) = std::env::var("FIRE_ENGINE_BETA_URL").ok()
    && !url.is_empty()
  {
    Some(url)
  } else {
    None
  }
});

static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn client() -> Result<&'static reqwest::Client, reqwest::Error> {
  super::shared_client(&CLIENT)
}

#[derive(Clone, Copy, Debug)]
pub struct FireEngine {
  url: &'static String,
}

impl FireEngine {
  #[instrument(
    name = "FireEngine::do_scrape",
    skip(self, meta),
    fields(
      fire_engine.job_id = tracing::field::Empty,
      fire_engine.job_abandoned = tracing::field::Empty,
      deadline.remaining_ms = tracing::field::Empty,
      javascript_return.parse_error = tracing::field::Empty,
      javascript_return.lone_surrogates = tracing::field::Empty,
    ),
    err
  )]
  pub async fn do_scrape(
    &self,
    meta: &Meta,
    proxy: ScrapeProxy,
    get_cookies: bool,
  ) -> Result<EngineOutcome<RawPageResult>, ScrapeURLError> {
    let wants_raw_base64 = meta.options.formats.contains(FormatKind::RawBase64);
    let youtube = !wants_raw_base64 && is_youtube_video_url(meta.get_url());

    let mut actions: Vec<InternalAction> = Vec::new();

    // Transform waitFor option into an action
    if let wait_for = meta.options.effective_wait_for()
      && wait_for > 0
    {
      actions.push(
        Action::Wait(WaitAction::Milliseconds {
          milliseconds: wait_for,
        })
        .into(),
      );
    }

    // Include user-specified actions
    actions.extend(meta.options.actions.iter().map(|x| x.to_owned().into()));

    // Transform screenshot format into an action
    if let Some(screenshot) = meta.options.formats.screenshot() {
      actions.push(
        Action::Screenshot {
          full_page: screenshot.full_page,
          viewport: screenshot.viewport.to_owned(),
          quality: screenshot.quality,
        }
        .into(),
      );
    }

    if meta.options.formats.contains(FormatKind::Branding) {
      actions.push(branding_action());
    }

    if meta.options.formats.contains(FormatKind::Audio)
      || meta.options.formats.contains(FormatKind::Video)
      || youtube
      || get_cookies
    {
      actions.push(InternalAction {
        action: Action::GetCookies,
        real_viewport: None,
        metadata: Some(InternalActionMetadata {
          __firecrawl_internal: Some(true),
        }),
      });
    }

    let had_actions = !actions.is_empty();
    let remaining_ms = meta.remaining_ms();
    tracing::Span::current().record("deadline.remaining_ms", remaining_ms);

    let request = FireEngineScrapeRequest {
      url: meta.get_url(),
      scrape_id: &meta.id,
      engine: FireEngineScrapeRequestEngine::ChromeCDP,
      format: wants_raw_base64.then_some(scrape::FireEngineScrapeRequestFormat::RawBase64),
      instant_return: false,
      skip_tls_verification: meta.options.should_skip_tls_verification(),
      headers: &meta.options.headers,
      priority: meta.internal_options.priority,
      geolocation: &meta.options.location,
      mobile: meta.options.mobile,
      timeout: remaining_ms.unwrap_or(300000),
      disable_smart_wait_cache: meta.internal_options.disable_smart_wait_cache,
      mobile_proxy: proxy == ScrapeProxy::Enhanced,
      auto_proxy: meta.options.proxy == ProxyMode::Auto,
      max_age: meta.options.max_age,
      save_scrape_result_to_gcs: false,
      zero_data_retention: meta.internal_options.zero_data_retention,

      // Branding and YouTube need media to be loaded
      // Note: what's up with the discrepancy of Audio + Video being present on force_non_renderer vs missing here? - Mogery
      block_media: !meta.options.formats.contains(FormatKind::Branding) && !youtube,

      // Branding needs media to be loaded, but not rendered.
      // On f-e, if you unblock media, it will also force it to be rendered.
      // If only branding needs media and nothing else, just force non-renderer.
      force_non_renderer: meta.options.formats.contains(FormatKind::Branding)
        && actions.iter().all(|x| x.is_renderless_safe())
        // && !meta.options.formats.contains(FormatKind::Screenshot) // NOTE: redundant check, screenshot gets mapped into actions - Mogery
        && !meta.options.formats.contains(FormatKind::Audio)
        && !meta.options.formats.contains(FormatKind::Video)
        && !youtube,

      actions,

      profile: meta
        .options
        .profile
        .as_ref()
        .map(|profile| FireEngineProfile {
          owner: &meta.team_id,
          name: &profile.name,
        }),

      pdf_max_size: fire_engine_pdf_max_size(meta),
    };

    let scrape = self.call_scrape(request).await?;
    let result = match self.finish_job(scrape).await? {
      Ok(x)
        if x.page_status_code == 415
          && let Some(page_error) = x.page_error.to_owned()
          && page_error.starts_with("Unsupported Media Type:") =>
      {
        return Err(ScrapeURLError::UnsupportedFileError { reason: page_error });
      }
      Ok(x) => x,
      Err(err) => {
        if err.retry_with_stealth {
          return Ok(EngineOutcome::ProxyElevationNeeded);
        }

        return Err(if let Some(code) = err.error.split("Chrome error: ").nth(1) {
          if code.contains("ERR_CERT_") || code.contains("ERR_SSL_") || code.contains("ERR_BAD_SSL_")
          {
            ScrapeURLError::SSLError {
              skip_tls_verification: meta.options.should_skip_tls_verification(),
            }
          } else {
            ScrapeURLError::SiteError {
              code: code.to_string(),
            }
          }
        } else if let Some(hostname) = err
          .error
          .split("Dns resolution error for hostname: ")
          .nth(1)
        {
          ScrapeURLError::DNSResolutionError {
            hostname: hostname.to_string(),
          }
        } else if let Some(i) = err.error.find("File exceeds size limit") {
          ScrapeURLError::UnsupportedFileError {
            reason: err.error[i..].to_string(),
          }
        } else if err.error.contains("failed to finish without timing out") {
          ScrapeURLError::PageLoadFailed
        } else if err.error.contains("Element")
          || err.error.contains("Javascript execution failed")
          || err.error.starts_with("ActionError: ")
        {
          // TODO: improve conditions later
          ScrapeURLError::ActionError {
            error: err
              .error
              .trim_start_matches("Error: ")
              .trim_start_matches("ActionError: ")
              .to_string(),
          }
        } else if err.error.contains("proxies available for") {
          ScrapeURLError::ProxySelectionError
        } else {
          ScrapeURLError::UnclassifiedEngineError {
            engine: Self::NAME,
            error: err.error,
          }
        });
      }
    };

    let mut screenshots_iter = result.screenshots.into_iter();

    Ok(EngineOutcome::Scraped(RawPageResult {
      url: result.url.unwrap_or_else(|| meta.get_url().to_owned()),

      filename: result.file.as_ref().map(|x| x.name.to_owned()),
      content: if let Some(file) = result.file {
        file.content.try_into()?
      } else {
        RawPageContent::ChromeRenderedDOM(result.content)
      },
      status_code: result.page_status_code,

      content_type: result
        .response_headers
        .into_iter()
        .find(|(k, _)| k.eq_ignore_ascii_case("content-type"))
        .map_or_else(|| "application/octet-stream".to_string(), |(_, v)| v),

      screenshot: if meta.options.formats.contains(FormatKind::Screenshot)
        && let Some(screenshot) = screenshots_iter.next()
      {
        Some(screenshot.to_owned())
      } else {
        None
      },

      actions: if had_actions {
        Some(RawPageActions {
          screenshots: screenshots_iter.collect(),
          scrapes: result.action_content,
          javascript_returns: result
            .action_results
            .iter()
            .filter_map(|x| match &x.kind {
              FireEngineActionResultKind::ExecuteJavascript {
                r#return: raw_return,
              } => Some(
                match parse_javascript_return(raw_return) {
                  Ok(value) => {
                    match serde_json::from_value::<JavascriptActionContent>(value.clone()) {
                      Ok(x) => x,
                      Err(_) => JavascriptActionContent {
                        r#type: "unknown".to_string(),
                        value,
                      },
                    }
                  }
                  Err(e) => {
                    tracing::Span::current().record("javascript_return.parse_error", e.to_string());
                    JavascriptActionContent {
                      r#type: "unknown".to_string(),
                      value: serde_json::Value::String(raw_return.clone()),
                    }
                  }
                },
              ),
              _ => None,
            })
            .collect(),
          pdfs: result
            .action_results
            .iter()
            .filter_map(|x| match &x.kind {
              FireEngineActionResultKind::Pdf { link } => Some(link.to_owned()),
              _ => None,
            })
            .collect(),
        })
      } else {
        None
      },

      proxy_used: if result.used_mobile_proxy {
        ScrapeProxy::Enhanced
      } else {
        ScrapeProxy::Basic
      },
      timezone: result.timezone,

      cached_at: None,

      audio_cookies: result
        .action_results
        .into_iter()
        .filter_map(|x| match x.kind {
          FireEngineActionResultKind::GetCookies { cookies } => Some(cookies),
          _ => None,
        })
        .flatten()
        .collect(),
    }))
  }
}

impl Engine for FireEngine {
  const NAME: &'static str = "fire-engine";
  const SPECIAL_REGEX: Option<&'static Regex> = None;
  const FEATURES: ConstFeatureFlags = ConstFeatureFlags::new(&[
    FeatureFlag::Actions,
    FeatureFlag::WaitFor,              // through actions transform
    FeatureFlag::Screenshot,           // through actions transform
    FeatureFlag::ScreenshotFullScreen, // through actions transform
    FeatureFlag::Audio,
    FeatureFlag::Video,
    FeatureFlag::Location,
    FeatureFlag::Mobile,
    FeatureFlag::Branding,
  ]);

  async fn get() -> Option<super::EngineKind> {
    FIRE_ENGINE_BETA_URL
      .as_ref()
      .map(|url| super::EngineKind::FireEngine(Self { url }))
  }

  #[instrument(name = "FireEngine::scrape", skip_all, err)]
  async fn scrape(
    &self,
    meta: &Meta,
    proxy: ScrapeProxy,
  ) -> Result<EngineOutcome<RawPageResult>, ScrapeURLError> {
    self.do_scrape(meta, proxy, false).await
  }
}
