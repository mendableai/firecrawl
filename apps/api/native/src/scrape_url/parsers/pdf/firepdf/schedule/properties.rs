use hegel::{TestCase, generators as gs};

use super::*;

/// Epoch milliseconds stay below 2^41 until the year 2039.
const CLOCK_MS: i64 = 1 << 41;

#[hegel::composite]
fn remaining_ms(tc: &TestCase) -> Option<i64> {
  tc.draw(gs::optional(hegel::one_of!(
    gs::integers::<i64>()
      .min_value(-CLOCK_MS)
      .max_value(MAX_DEADLINE_MS * 2),
    gs::integers::<i64>().min_value(-CLOCK_MS),
    gs::integers::<i64>(),
  )))
}

/// A clock reading: realistic epoch milliseconds, or any i64.
#[hegel::composite]
fn epoch_ms(tc: &TestCase) -> i64 {
  tc.draw(hegel::one_of!(
    gs::integers::<i64>().min_value(0).max_value(CLOCK_MS),
    gs::integers::<i64>(),
  ))
}

#[hegel::test]
fn job_deadlines_stay_inside_the_caller_window(tc: TestCase) {
  let remaining = tc.draw(remaining_ms());
  let pages_estimate = tc.draw(gs::integers::<u32>());
  let caller_window = compute_deadline_ms(remaining);
  assert!(caller_window <= MAX_DEADLINE_MS);
  if let Some(remaining) = remaining {
    assert!(caller_window <= remaining);
  }
  if remaining.is_none_or(|x| x >= 0) {
    assert!(caller_window >= 0, "{caller_window}");
  }

  let by_reference = compute_by_reference_deadline_ms(remaining, pages_estimate);
  assert!((MIN_DEADLINE_MS..=MAX_DEADLINE_MS).contains(&by_reference));
  assert!(by_reference >= caller_window);

  let inline = compute_inline_job_deadline_ms(caller_window);
  assert!(inline >= MIN_DEADLINE_MS, "{inline}");
  if remaining.is_some_and(|x| x < MIN_ASYNC_CALLER_WINDOW_MS) {
    return;
  }
  assert!(
    inline >= MIN_DEADLINE_MS + INLINE_SUBMIT_SLACK_MS,
    "{inline}"
  );
  assert!(inline < caller_window, "{inline} >= {caller_window}");
}

#[hegel::test]
fn polls_never_wait_past_the_polling_deadline(tc: TestCase) {
  let configured_wait = tc.draw(gs::integers::<i64>().min_value(0));
  let until_deadline = tc.draw(hegel::one_of!(
    gs::integers::<i64>()
      .min_value(-CLOCK_MS)
      .max_value(CLOCK_MS),
    gs::integers::<i64>(),
  ));
  let wait = long_poll_wait_for(configured_wait, until_deadline);
  if wait != 0 {
    assert!((LONG_POLL_MIN_WAIT_MS..=LONG_POLL_MAX_WAIT_MS).contains(&wait));
    assert!(wait <= configured_wait);
    assert!(wait <= until_deadline - LONG_POLL_DEADLINE_SLACK_MS);
  }

  let previous = tc.draw(hegel::one_of!(
    gs::just(0),
    gs::integers::<i64>()
      .min_value(POLL_FLOOR_MS)
      .max_value(POLL_CAP_MS),
    gs::integers::<i64>(),
  ));
  let retry_after = tc.draw(gs::optional(gs::integers::<i64>()));
  let random = tc.draw(gs::floats::<f64>().min_value(0.0).max_value(1.0));
  let delay = next_poll_delay(previous, retry_after, random);
  assert!((POLL_FLOOR_MS..=POLL_CAP_MS).contains(&delay), "{delay}");

  let now = tc.draw(epoch_ms());
  let job_deadline = tc.draw(gs::optional(epoch_ms()));
  let aligned = align_poll_delay(delay, now, job_deadline);
  assert!(aligned <= delay);
  if let Some(job_deadline) = job_deadline {
    let latest = job_deadline
      .saturating_add(JOB_DEADLINE_POLL_GRACE_MS)
      .max(now.saturating_add(POLL_FLOOR_MS));
    let lands = now.saturating_add(aligned);
    assert!(lands <= latest, "{now} + {aligned} > {latest}");
  }
}
