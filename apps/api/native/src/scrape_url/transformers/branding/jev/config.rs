//! Jev's settings, read from the environment like TS `config`, and the gate
//! that decides whether branding asks Jev first.

use std::ops::RangeInclusive;
use std::sync::LazyLock;
use std::time::Duration;

use super::super::super::super::formats::{BrandingMode, BrandingOptions, Format, FormatKind};
use super::super::super::super::meta::Meta;

fn var(name: &str) -> Option<String> {
  let value = std::env::var(name).ok()?;
  let value = value.trim();
  (!value.is_empty()).then(|| value.to_string())
}

fn number(name: &str, range: RangeInclusive<f64>) -> Option<f64> {
  var(name)?.parse().ok().filter(|x| range.contains(x))
}

/// zod `stringbool`'s truthy values.
pub fn env_flag(name: &str) -> bool {
  var(name).is_some_and(|x| {
    matches!(
      x.to_ascii_lowercase().as_str(),
      "true" | "1" | "yes" | "on" | "y" | "enabled"
    )
  })
}

pub static API_KEY: LazyLock<Option<String>> = LazyLock::new(|| var("TYPESAFE_API_KEY"));

/// The SDK's `TYPESAFE_BASE_URL`, without trailing slashes.
pub static BASE_URL: LazyLock<String> = LazyLock::new(|| {
  var("TYPESAFE_BASE_URL")
    .as_deref()
    .unwrap_or("https://api.typesafe.ai")
    .trim_end_matches('/')
    .to_string()
});

pub static TIMEOUT: LazyLock<Duration> = LazyLock::new(|| {
  let ms = var("BRANDING_JEV_TIMEOUT_MS")
    .and_then(|x| x.parse::<u64>().ok())
    .filter(|x| *x > 0);
  Duration::from_millis(ms.unwrap_or(5000))
});

/// Rerun branding on the LLM when Jev's logo confidence is below this.
pub static ESCALATE_BELOW: LazyLock<Option<f64>> =
  LazyLock::new(|| number("BRANDING_JEV_ESCALATE_BELOW", 0.0..=1.0));

pub static SHADOW_PERCENT: LazyLock<f64> =
  LazyLock::new(|| number("BRANDING_JEV_SHADOW_PERCENT", 0.0..=100.0).unwrap_or(0.0));

static ENABLED: LazyLock<bool> = LazyLock::new(|| env_flag("BRANDING_JEV"));

static TEAM_IDS: LazyLock<Vec<String>> = LazyLock::new(|| {
  var("BRANDING_JEV_TEAM_IDS")
    .map(|x| x.split(',').map(|x| x.trim().to_string()).collect())
    .unwrap_or_default()
});

static ROLLOUT_PERCENT: LazyLock<f64> =
  LazyLock::new(|| number("BRANDING_JEV_ROLLOUT_PERCENT", 0.0..=100.0).unwrap_or(0.0));

/// TS `sampled`: FNV-1a over the key's UTF-16 units, so a cohort in at 5% is
/// still in at 30%.
fn sampled(key: &str, percent: f64) -> bool {
  if percent <= 0.0 {
    return false;
  }
  if percent >= 100.0 {
    return true;
  }
  let hash = key.encode_utf16().fold(2166136261u32, |h, unit| {
    (h ^ unit as u32).wrapping_mul(16777619)
  });
  (hash as f64 / 4294967296.0) * 100.0 < percent
}

/// TS `isJevBrandingEnabled`. Teams listed in `BRANDING_JEV_TEAM_IDS` use Jev
/// only for mode `fast`; every other team ignores `mode`.
pub fn is_jev_branding_enabled(meta: &Meta) -> bool {
  if API_KEY.is_none() {
    return false;
  }
  let team = meta.team_id.as_str();
  if !team.is_empty() && TEAM_IDS.iter().any(|x| x == team) {
    return matches!(
      meta.options.formats.get(FormatKind::Branding),
      Some(Format::Branding(BrandingOptions {
        mode: Some(BrandingMode::Fast)
      }))
    );
  }
  *ENABLED || (!team.is_empty() && sampled(&format!("team:{team}"), *ROLLOUT_PERCENT))
}

/// `Math.random()`, from a v4 UUID's random bits.
pub fn random() -> f64 {
  let bits = uuid::Uuid::new_v4().as_u128() as u64 & ((1 << 53) - 1);
  bits as f64 / (1u64 << 53) as f64
}
