//! TS's `CacheBackend` for deterministic JSON: generated extractors and
//! askLlm answers in the main database, shared with the TS worker. Reads go to
//! the replica like TS's `dbRr`, writes to the primary like `db`.

use std::str::FromStr;

use chrono::Utc;
use sqlx::{
  PgPool,
  postgres::{PgConnectOptions, PgPoolOptions},
};
use tokio::sync::OnceCell;
use tracing::{Span, field::Empty, instrument};

use super::{DeterministicJsonError, config::CACHE_VERSION};

static PRIMARY: OnceCell<Option<PgPool>> = OnceCell::const_new();
static REPLICA: OnceCell<Option<PgPool>> = OnceCell::const_new();

fn env(name: &str) -> Option<String> {
  std::env::var(name).ok().filter(|x| !x.is_empty())
}

/// zod's `stringbool()` for `USE_DB_AUTHENTICATION`.
fn db_authentication() -> bool {
  env("USE_DB_AUTHENTICATION").is_some_and(|x| {
    matches!(
      x.to_ascii_lowercase().as_str(),
      "true" | "1" | "yes" | "on" | "y" | "enabled"
    )
  })
}

fn connect(url: Option<String>) -> Result<Option<PgPool>, DeterministicJsonError> {
  let Some(url) = url.filter(|_| db_authentication()) else {
    return Ok(None);
  };
  let options = PgConnectOptions::from_str(&url.replace("sslmode=no-verify", "sslmode=require"))?
    .statement_cache_capacity(0);
  Ok(Some(
    PgPoolOptions::new()
      .min_connections(0)
      .max_connections(4)
      .connect_lazy_with(options),
  ))
}

async fn primary() -> Result<&'static PgPool, DeterministicJsonError> {
  PRIMARY
    .get_or_try_init(|| async { connect(env("DATABASE_URL")) })
    .await?
    .as_ref()
    .ok_or(DeterministicJsonError::NotConfigured("Database client"))
}

async fn replica() -> Result<&'static PgPool, DeterministicJsonError> {
  REPLICA
    .get_or_try_init(|| async {
      connect(env("DATABASE_REPLICA_URL").or_else(|| env("DATABASE_URL")))
    })
    .await?
    .as_ref()
    .ok_or(DeterministicJsonError::NotConfigured(
      "Database replica client",
    ))
}

#[instrument(name = "deterministic_json::cache::get_extractor", skip_all, fields(hit = Empty), err)]
pub async fn get_extractor(key: &str) -> Result<Option<String>, DeterministicJsonError> {
  let code: Option<String> =
    sqlx::query_scalar("select code from deterministic_json_scripts where cache_key = $1 limit 1")
      .bind(key)
      .fetch_optional(replica().await?)
      .await?;
  Span::current().record("hit", code.is_some());
  Ok(code)
}

#[instrument(name = "deterministic_json::cache::set_extractor", skip_all, err)]
pub async fn set_extractor(
  key: &str,
  code: &str,
  url: &str,
  model: &str,
) -> Result<(), DeterministicJsonError> {
  let now = Utc::now();
  sqlx::query(
    "insert into deterministic_json_scripts (cache_key, code, url, model, cache_version, updated_at, last_used_at)
     values ($1, $2, $3, $4, $5, $6, $6)
     on conflict (cache_key) do update set code = $2, url = $3, model = $4, cache_version = $5, updated_at = $6, last_used_at = $6",
  )
  .bind(key)
  .bind(code)
  .bind(url)
  .bind(model)
  .bind(CACHE_VERSION as i32)
  .bind(now)
  .execute(primary().await?)
  .await?;
  Ok(())
}

#[instrument(name = "deterministic_json::cache::get_llm", skip_all, fields(hit = Empty), err)]
pub async fn get_llm(key: &str) -> Result<Option<String>, DeterministicJsonError> {
  let response: Option<String> = sqlx::query_scalar(
    "select response from deterministic_json_llm_cache where cache_key = $1 limit 1",
  )
  .bind(key)
  .fetch_optional(replica().await?)
  .await?;
  Span::current().record("hit", response.is_some());
  Ok(response)
}

#[instrument(name = "deterministic_json::cache::set_llm", skip_all, err)]
pub async fn set_llm(key: &str, response: &str) -> Result<(), DeterministicJsonError> {
  sqlx::query(
    "insert into deterministic_json_llm_cache (cache_key, response, last_used_at) values ($1, $2, $3)
     on conflict (cache_key) do update set response = $2, last_used_at = $3",
  )
  .bind(key)
  .bind(response)
  .bind(Utc::now())
  .execute(primary().await?)
  .await?;
  Ok(())
}

/// Bumps `last_used_at` in both tables, like TS `touch`.
#[instrument(name = "deterministic_json::cache::touch", skip_all, err)]
pub async fn touch(key: &str) -> Result<(), DeterministicJsonError> {
  let pool = primary().await?;
  let now = Utc::now();
  let scripts =
    sqlx::query("update deterministic_json_scripts set last_used_at = $1 where cache_key = $2")
      .bind(now)
      .bind(key)
      .execute(pool);
  let llm =
    sqlx::query("update deterministic_json_llm_cache set last_used_at = $1 where cache_key = $2")
      .bind(now)
      .bind(key)
      .execute(pool);
  tokio::try_join!(scripts, llm)?;
  Ok(())
}
