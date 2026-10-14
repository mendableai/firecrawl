//! TS's Jev circuit breaker: after 5 failed calls in a row, branding skips Jev
//! for a minute so an outage doesn't add the timeout to every request.

use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

const FAILURES: u32 = 5;
const COOLDOWN: Duration = Duration::from_secs(60);

struct Breaker {
  consecutive_failures: u32,
  open_until: Option<Instant>,
}

impl Breaker {
  fn is_open(&self) -> bool {
    self.open_until.is_some_and(|until| Instant::now() < until)
  }
}

static BREAKER: Mutex<Breaker> = Mutex::new(Breaker {
  consecutive_failures: 0,
  open_until: None,
});

fn breaker() -> MutexGuard<'static, Breaker> {
  BREAKER.lock().unwrap_or_else(PoisonError::into_inner)
}

pub fn is_open() -> bool {
  breaker().is_open()
}

/// Counts a failed call; true when this failure opened the breaker.
pub fn record_failure() -> bool {
  let mut breaker = breaker();
  breaker.consecutive_failures = breaker.consecutive_failures.saturating_add(1);
  if breaker.consecutive_failures >= FAILURES && !breaker.is_open() {
    breaker.open_until = Some(Instant::now() + COOLDOWN);
    return true;
  }
  false
}

/// A call that started before the breaker opened and succeeds late doesn't
/// close it: the next failure after the cooldown reopens it at once.
pub fn record_success() {
  let mut breaker = breaker();
  if !breaker.is_open() {
    breaker.consecutive_failures = 0;
  }
}
