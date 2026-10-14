//! TS `extractDeterministicJson`: reuse the cached extractor for this URL,
//! schema and prompt or generate one, run it in the sandbox, regenerate once
//! when it fails, and repair too-strict selectors once.

use std::sync::Arc;

use serde_json::Value;
use tracing::{Span, field::Empty, instrument};

use super::super::super::cost_tracking::CostTracking;
use super::{
  DeterministicJsonError,
  anchor::{AnchorArgs, build_anchor_context},
  ask_llm::AskLlm,
  cache,
  config::{CACHE_VERSION, CODE_SANDBOX_URL, CODEGEN_MODEL, MARKDOWN_BUDGET},
  generate::generate_extractor,
  js,
  postprocess::parse_with_schema,
  prompts::ExtractorPrompt,
  sandbox::run_extractor_in_sandbox,
  selector_repair::{too_strict_feedback, too_strict_selectors},
  sha,
};

pub struct ExtractArgs<'a> {
  pub url: &'a str,
  pub prompt: &'a str,
  pub json_schema: &'a Value,
  pub html: &'a str,
  pub markdown: &'a str,
  pub cost_tracking: &'a Arc<CostTracking>,
}

struct Extraction<'a> {
  args: ExtractArgs<'a>,
  key: String,
  schema_json: String,
  markdown_preview: String,
  anchor_html: Option<String>,
}

/// TS `extractDeterministicJson`. `None` is JS `undefined`.
#[instrument(
  name = "deterministic_json::extract",
  skip_all,
  fields(cached = Empty, too_strict = Empty, repaired = Empty, regenerated = Empty),
  err
)]
pub async fn extract_deterministic_json(
  args: ExtractArgs<'_>,
) -> Result<Option<Value>, DeterministicJsonError> {
  let span = Span::current();
  let schema_json = args.json_schema.to_string();
  let key = sha(
    &[
      CACHE_VERSION.to_string().as_str(),
      &CODEGEN_MODEL,
      args.url,
      &schema_json,
      args.prompt,
    ]
    .join("\0"),
  );
  let markdown_preview = clip_middle(js::trim(args.markdown), MARKDOWN_BUDGET);
  let cached = cache::get_extractor(&key).await?;
  span.record("cached", cached.is_some());
  let mut extraction = Extraction {
    args,
    key,
    schema_json,
    markdown_preview,
    anchor_html: None,
  };

  let code = match cached {
    Some(code) => {
      cache::touch(&extraction.key).await?;
      code
    }
    None => extraction.generate(None, None).await?,
  };

  match extraction.run_with_repair(&code).await {
    Ok(value) => Ok(value),
    // A second failure propagates; an empty shape would hide it as "no data".
    Err(error) => {
      span.record("regenerated", true);
      let code = extraction
        .generate(Some(&error.to_string()), Some(&code))
        .await?;
      extraction.run(&code).await
    }
  }
}

impl Extraction<'_> {
  async fn generate(
    &mut self,
    rejection_feedback: Option<&str>,
    previous_code: Option<&str>,
  ) -> Result<String, DeterministicJsonError> {
    let anchor_html = match self.anchor_html.take() {
      Some(x) => x,
      None => {
        let args = AnchorArgs {
          html: self.args.html,
          markdown_preview: &self.markdown_preview,
          schema_json: &self.schema_json,
          prompt: self.args.prompt,
        };
        build_anchor_context(&args, self.args.cost_tracking).await
      }
    };
    let anchor_html = self.anchor_html.insert(anchor_html);
    let prompt = ExtractorPrompt {
      user_prompt: self.args.prompt,
      schema_json: &self.schema_json,
      markdown_preview: &self.markdown_preview,
      anchor_html,
      rejection_feedback,
      previous_code,
    };
    let code = generate_extractor(prompt, self.args.cost_tracking).await?;
    cache::set_extractor(&self.key, &code, self.args.url, &CODEGEN_MODEL).await?;
    Ok(code)
  }

  async fn run(&self, code: &str) -> Result<Option<Value>, DeterministicJsonError> {
    let ask = AskLlm::new(self.args.cost_tracking.clone());
    let value =
      run_extractor_in_sandbox(&CODE_SANDBOX_URL, code, self.args.html, self.args.url, &ask)
        .await?;
    Ok(parse_with_schema(value, self.args.json_schema))
  }

  /// Runs `code`; when a selector is too strict, regenerates once and keeps
  /// the repair only if it has fewer broken selectors and runs.
  async fn run_with_repair(&mut self, code: &str) -> Result<Option<Value>, DeterministicJsonError> {
    let value = self.run(code).await?;
    let broken = too_strict_selectors(code, self.args.html);
    let span = Span::current();
    span.record("too_strict", broken.len());
    if broken.is_empty() {
      return Ok(value);
    }

    // A failed repair keeps the original result; its spans record why.
    let repaired = self
      .repair(code, &too_strict_feedback(&broken), broken.len())
      .await;
    span.record("repaired", matches!(repaired, Ok(Some(_))));
    if let Ok(Some(value)) = repaired {
      return Ok(value);
    }
    cache::set_extractor(&self.key, code, self.args.url, &CODEGEN_MODEL).await?;
    Ok(value)
  }

  /// The repaired extractor's result, or `None` when it isn't an improvement.
  async fn repair(
    &mut self,
    code: &str,
    feedback: &str,
    broken: usize,
  ) -> Result<Option<Option<Value>>, DeterministicJsonError> {
    let repaired = self.generate(Some(feedback), Some(code)).await?;
    if too_strict_selectors(&repaired, self.args.html).len() >= broken {
      return Ok(None);
    }
    Ok(Some(self.run(&repaired).await?))
  }
}

fn clip_middle(text: &str, max: usize) -> String {
  let len = js::len(text);
  if len <= max {
    return text.to_string();
  }
  let marker = format!("\n\n[...{} chars trimmed...]\n\n", len - max);
  let room = max.saturating_sub(js::len(&marker));
  let head = (room as f64 * 0.7).ceil() as usize;
  format!(
    "{}{marker}{}",
    js::prefix(text, head),
    js::suffix(text, room.saturating_sub(head))
  )
}
