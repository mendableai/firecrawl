//! The Enterprise API access token, cached in Redis under the key TS uses so every
//! instance shares it. A lock keeps concurrent scrapes from all logging in at once.

use std::time::Duration;

use redis::{
  AsyncTypedCommands, ExistenceCheck, Script, SetExpiry, SetOptions, aio::MultiplexedConnection,
};
use serde::Deserialize;
use serde_json::json;
use tokio::sync::{Mutex, OnceCell};
use tracing::{Span, field::Empty};

use super::super::super::error::ScrapeURLError;
use super::{USER_AGENT, engine_error};

const AUTH_URL: &str = "https://auth.enterprise.wikimedia.com/v1/login";
const TOKEN_KEY: &str = "wikipedia_enterprise:access_token";
const LOCK_KEY: &str = "lock:wikipedia_enterprise:auth";
const LOCK_TTL_MS: u64 = 10_000;
const RELEASE_LOCK: &str = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

type Connection = Option<Mutex<MultiplexedConnection>>;

/// The token lives on `REDIS_URL` and the lock on `REDIS_RATE_LIMIT_URL`, like TS's redlock.
static TOKEN_REDIS: OnceCell<Connection> = OnceCell::const_new();
static LOCK_REDIS: OnceCell<Connection> = OnceCell::const_new();

/// `None` when the variable is unset or the connection failed; a failure is retried next time.
async fn redis(
  cell: &'static OnceCell<Connection>,
  var: &str,
) -> Option<&'static Mutex<MultiplexedConnection>> {
  let init = || async {
    let Some(url) = std::env::var(var).ok().filter(|x| !x.is_empty()) else {
      return Ok(None);
    };
    let client = redis::Client::open(url)?;
    Ok::<_, redis::RedisError>(Some(Mutex::new(
      client.get_multiplexed_async_connection().await?,
    )))
  };
  cell.get_or_try_init(init).await.ok()?.as_ref()
}

async fn cached_token() -> Option<String> {
  let redis = redis(&TOKEN_REDIS, "REDIS_URL").await?;
  redis.lock().await.get(TOKEN_KEY).await.ok().flatten()
}

/// Drops a token the API rejected, so the next scrape logs in again.
pub async fn clear_cached_token() {
  if let Some(redis) = redis(&TOKEN_REDIS, "REDIS_URL").await
    && let Err(error) = redis.lock().await.del(TOKEN_KEY).await
  {
    tracing::error!(error = %error, "failed to clear the Wikipedia Enterprise token");
  }
}

#[derive(Deserialize)]
struct Login {
  access_token: String,
  expires_in: i64,
}

async fn log_in(
  client: &reqwest::Client,
  username: &str,
  password: &str,
) -> Result<String, ScrapeURLError> {
  let response = client
    .post(AUTH_URL)
    .header("User-Agent", USER_AGENT)
    .json(&json!({ "username": username, "password": password }))
    .send()
    .await?;
  let status = response.status();
  if !status.is_success() {
    let body = response.text().await.unwrap_or_default();
    return Err(engine_error(format!(
      "Wikipedia Enterprise authentication failed ({}): {body}",
      status.as_u16()
    )));
  }
  let login: Login = response.json().await?;
  if let Some(redis) = redis(&TOKEN_REDIS, "REDIS_URL").await {
    let ttl = login.expires_in.saturating_sub(300).max(60).unsigned_abs();
    let stored = redis
      .lock()
      .await
      .set_ex(TOKEN_KEY, &login.access_token, ttl)
      .await;
    if let Err(error) = stored {
      tracing::error!(error = %error, "failed to cache the Wikipedia Enterprise token");
    }
  }
  Ok(login.access_token)
}

/// Holds the login lock, waiting for whoever has it. Without a lock Redis it proceeds unlocked.
async fn acquire_lock(value: &str) -> Option<&'static Mutex<MultiplexedConnection>> {
  let redis = redis(&LOCK_REDIS, "REDIS_RATE_LIMIT_URL").await?;
  let options = SetOptions::default()
    .conditional_set(ExistenceCheck::NX)
    .with_expiration(SetExpiry::PX(LOCK_TTL_MS));
  loop {
    match redis
      .lock()
      .await
      .set_options(LOCK_KEY, value, options.clone())
      .await
    {
      Ok(Some(_)) => return Some(redis),
      Ok(None) => {}
      Err(error) => {
        tracing::error!(error = %error, "failed to take the Wikipedia Enterprise login lock");
        return None;
      }
    }
    tokio::time::sleep(Duration::from_millis(100 + rand::random_range(0..200))).await;
  }
}

/// A valid access token: Redis's, or a fresh login under the lock.
#[tracing::instrument(name = "WikipediaEngine::access_token", skip_all, fields(wikipedia.token = Empty), err)]
pub async fn access_token(
  client: &reqwest::Client,
  username: &str,
  password: &str,
) -> Result<String, ScrapeURLError> {
  let span = Span::current();
  if let Some(token) = cached_token().await {
    span.record("wikipedia.token", "cached");
    return Ok(token);
  }

  let lock_value = format!("{:032x}", rand::random::<u128>());
  let lock = acquire_lock(&lock_value).await;
  let token = match cached_token().await {
    Some(token) => {
      span.record("wikipedia.token", "cached_after_lock");
      Ok(token)
    }
    None => {
      span.record("wikipedia.token", "logged_in");
      log_in(client, username, password).await
    }
  };
  if let Some(redis) = lock {
    let released: Result<i64, _> = Script::new(RELEASE_LOCK)
      .key(LOCK_KEY)
      .arg(&lock_value)
      .invoke_async(&mut *redis.lock().await)
      .await;
    if let Err(error) = released {
      tracing::error!(error = %error, "failed to release the Wikipedia Enterprise login lock");
    }
  }
  token
}
