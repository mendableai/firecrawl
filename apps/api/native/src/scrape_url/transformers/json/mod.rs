use serde_json::{Value, json};
use tracing::instrument;

use super::super::{
  document::Document,
  llm::{self, LlmError},
  meta::Meta,
  options::V1OriginalFormat,
};
use super::TransformerError;

mod generate;
mod repair;
mod schema;

pub(super) use generate::{CompletionOptions, generate_object};

// ~2MB of markdown, well past typical page sizes -- caps worst-case JSON extraction cost/latency.
const MAX_JSON_EXTRACTION_MARKDOWN_CHARS: usize = 2_000_000;

const SCHEMA_GENERATOR_SYSTEM_PROMPT: &str = "You are a schema generator for a web scraping system. Generate a JSON schema based on the user's prompt.
Consider:
1. The type of data being requested
2. Required fields vs optional fields
3. Appropriate data types for each field
4. Nested objects and arrays where appropriate

Valid JSON schema, has to be simple. No crazy properties. OpenAI has to support it.
Supported types
The following types are supported for Structured Outputs:

String
Number
Boolean
Integer
Object
Array
Enum
anyOf

Formats are not supported. Min/max are not supported. Anything beyond the above is not supported. Keep it simple with types and descriptions.
Optionals are not supported.
DO NOT USE FORMATS.
Keep it simple. Don't create too many properties, just the ones that are needed. Don't invent properties.
Return a valid JSON schema object with properties that would capture the information requested in the prompt.";

#[instrument(
  name = "transformers::json::generate_schema_from_prompt",
  skip_all,
  err
)]
async fn generate_schema_from_prompt(meta: &Meta, prompt: &str) -> Result<Value, TransformerError> {
  let user_prompt =
    format!("Generate a JSON schema for extracting the following information: {prompt}");
  let options = CompletionOptions {
    model: llm::model_name_with_override("gpt-4o-mini"),
    retry_model: llm::model_name_with_override("gpt-4.1-mini"),
    prompt: Some(&user_prompt),
    system_prompt: Some(SCHEMA_GENERATOR_SYSTEM_PROMPT),
    schema: None,
    cost_metadata: json!({ "module": "scrapeURL", "method": "generateSchemaFromPrompt" }),
  };

  let mut last_error: Option<TransformerError> = None;
  for _ in 0..3 {
    match generate_object(meta, &options, "").await {
      Ok(x) => return Ok(x.extract),
      Err(e) => last_error = Some(e),
    }
  }

  Err(LlmError::SchemaGeneration(
    last_error.map(|e| e.to_string()).unwrap_or_default(),
  )
  .into())
}

#[instrument(
  name = "transformers::json::perform_llm_extract",
  skip(meta, document),
  fields(
    json.prompt = tracing::field::Empty,
    json.schema = tracing::field::Empty,
    json.check_prompt_injection = tracing::field::Empty,
    llm.function_id = tracing::field::Empty,
    llm.telemetry = tracing::field::Empty,
  ),
  err
)]
pub async fn perform_llm_extract(
  meta: &Meta,
  mut document: Document,
) -> Result<Document, TransformerError> {
  let Some(options) = meta.options.formats.json() else {
    return Ok(document);
  };

  let span = tracing::Span::current();
  span.record("json.prompt", options.prompt.as_deref());
  span.record(
    "json.schema",
    options.schema.as_ref().map(|x| x.to_string()).as_deref(),
  );
  span.record("json.check_prompt_injection", options.check_prompt_injection);
  let telemetry = meta.internal_options.llm_telemetry.as_ref();
  span.record(
    "llm.function_id",
    telemetry.map_or("performLLMExtract", |x| x.function_id.as_str()),
  );
  if let Some(telemetry) = telemetry {
    span.record(
      "llm.telemetry",
      serde_json::to_string(&telemetry.metadata).ok(),
    );
  }

  let Some(markdown) = document.markdown.as_deref() else {
    return Err(TransformerError::CalledOutOfOrder(
      "markdown is None".to_string(),
    ));
  };

  if markdown.encode_utf16().count() > MAX_JSON_EXTRACTION_MARKDOWN_CHARS {
    return Err(TransformerError::JsonContentTooLarge);
  }

  let model = match options.schema.as_ref() {
    Some(schema) if schema::detect_recursive_schema(schema) => {
      llm::model_name_with_override("gpt-4.1")
    }
    _ => llm::model_name_with_override("gpt-4o-mini"),
  };

  let user_schema = match (&options.schema, &options.prompt) {
    (Some(schema), _) => Some(schema.clone()),
    (None, Some(prompt)) => Some(generate_schema_from_prompt(meta, prompt).await?),
    (None, None) => None,
  };
  let user_schema = user_schema.map(|schema| schema::resolve_schema_refs(&schema));
  let normalized_schema = user_schema.as_ref().map(schema::normalize_user_schema);

  let completion_options = CompletionOptions {
    model,
    retry_model: llm::model_name_with_override("gpt-4.1-mini"),
    prompt: options.prompt.as_deref(),
    system_prompt: None,
    schema: normalized_schema.as_ref(),
    cost_metadata: json!({
      "module": "scrapeURL",
      "method": "extractData",
      "description": "Check if using smartScrape is needed for this case",
    }),
  };
  let (extract, warning) = match generate_object(meta, &completion_options, markdown).await {
    Ok(completion) => (Some(completion.extract), completion.warning),
    Err(TransformerError::Llm(e)) => {
      let reason: String = e.to_string().chars().take(300).collect();
      (None, Some(format!("JSON extraction failed: {reason}")))
    }
    Err(e) => return Err(e),
  };

  if let Some(warning) = warning.as_deref() {
    document.prepend_warning(warning);
  }
  if extract.is_none() && warning.is_none() {
    document.prepend_warning("JSON extraction did not produce a result.");
  }
  let extract = extract.unwrap_or(Value::Null);

  if meta.internal_options.v1_original_format == Some(V1OriginalFormat::Extract) {
    document.extract = Some(extract);
  } else {
    document.json = Some(extract);
  }

  Ok(document)
}
