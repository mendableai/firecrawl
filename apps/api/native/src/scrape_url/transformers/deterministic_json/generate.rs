//! TS `pipeline/generate.ts`: prompt the codegen model, then statically check
//! the extractor; a rejection is fed back for one more attempt.

use std::sync::LazyLock;

use regex::Regex;
use tracing::{Span, field::Empty, instrument};

use super::super::super::cost_tracking::CostTracking;
use super::{
  DeterministicJsonError, js,
  llm::generate_code,
  prompts::{ExtractorPrompt, extractor_messages},
  validate::{Issue, clean_generated_code, format_issues, validate_generated_extractor},
};

const MAX_ATTEMPTS: u32 = 2;

static SPACES: LazyLock<Regex> =
  LazyLock::new(|| Regex::new(&format!("{}+", js::SPACE_CLASS)).expect("static regex"));

/// TS `generateExtractor`.
#[instrument(
  name = "deterministic_json::generate_extractor",
  skip_all,
  fields(attempts = Empty, rejected = Empty),
  err
)]
pub async fn generate_extractor(
  prompt: ExtractorPrompt<'_>,
  cost_tracking: &CostTracking,
) -> Result<String, DeterministicJsonError> {
  let span = Span::current();
  let mut feedback = prompt.rejection_feedback.map(str::to_string);
  let mut previous_code = prompt.previous_code.map(str::to_string);
  let mut last_issues = Vec::new();

  for attempt in 1..=MAX_ATTEMPTS {
    span.record("attempts", attempt);
    let messages = extractor_messages(&ExtractorPrompt {
      rejection_feedback: feedback.as_deref(),
      previous_code: previous_code.as_deref(),
      ..prompt
    });
    let generation = generate_code(messages, cost_tracking).await?;
    if generation.truncated {
      return Err(DeterministicJsonError::Truncated);
    }

    let (code, issues) = match clean_generated_code(&generation.content) {
      Ok(code) => {
        let issues = validate_generated_extractor(&code);
        (code, issues)
      }
      Err(reason) => {
        let excerpt = SPACES.replace_all(&generation.content, " ");
        let issue = Issue {
          field: "source",
          reason,
          excerpt: js::prefix(&excerpt, 180).to_string(),
        };
        (String::new(), vec![issue])
      }
    };
    if issues.is_empty() {
      return Ok(code);
    }

    span.record("rejected", attempt);
    feedback = Some(format_issues(&issues));
    // Repair our own latest attempt next round, not the stale code passed in.
    if !code.is_empty() {
      previous_code = Some(code);
    }
    last_issues = issues;
  }

  Err(DeterministicJsonError::Validation(format_issues(
    &last_issues,
  )))
}
