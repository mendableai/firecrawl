//! Reading the model's answer as the AI SDK's `generateObject` does: parse,
//! validate against the zod schema, and repair once if either fails.

use serde_json::{Map, Value, json};

use super::super::enhancement::{
  BrandingEnhancement, ButtonClassification, CleanedFont, ColorRoles, LlmLogoSelection,
};

const JSON_SCHEMA_TYPES: [&str; 7] = [
  "string", "number", "integer", "boolean", "object", "array", "null",
];

type Object = Map<String, Value>;

fn string(object: &Object, key: &str) -> Option<String> {
  object.get(key)?.as_str().map(str::to_string)
}

fn number(object: &Object, key: &str) -> Option<f64> {
  object.get(key)?.as_f64()
}

/// `z.number().min(0).max(1)`.
fn unit(object: &Object, key: &str) -> Option<f64> {
  number(object, key).filter(|x| (0.0..=1.0).contains(x))
}

fn one_of(object: &Object, key: &str, options: &[&str]) -> Option<String> {
  string(object, key).filter(|x| options.contains(&x.as_str()))
}

/// A model's index. zod takes any number; a fractional one matches no
/// button or candidate, so it reads as none.
fn index(object: &Object, key: &str) -> Option<i64> {
  let x = number(object, key)?;
  Some(if x.fract() == 0.0 { x as i64 } else { -1 })
}

/// A field with `.optional()` or `.default()`: absent is fine, anything
/// present has to validate (`null` included).
fn optional<T>(
  object: &Object,
  key: &str,
  parse: impl Fn(&Object) -> Option<T>,
) -> Option<Option<T>> {
  match object.get(key) {
    None => Some(None),
    Some(value) => value.as_object().and_then(parse).map(Some),
  }
}

fn button_classification(o: &Object) -> Option<ButtonClassification> {
  Some(ButtonClassification {
    primary_button_index: index(o, "primaryButtonIndex")?,
    primary_button_reasoning: string(o, "primaryButtonReasoning")?,
    secondary_button_index: index(o, "secondaryButtonIndex")?,
    secondary_button_reasoning: string(o, "secondaryButtonReasoning")?,
    confidence: unit(o, "confidence")?,
  })
}

fn color_roles(o: &Object) -> Option<ColorRoles> {
  let secondary_color = match o.get("secondaryColor") {
    None => None,
    Some(value) => Some(value.as_str()?.to_string()),
  };
  Some(ColorRoles {
    primary_color: string(o, "primaryColor")?,
    secondary_color,
    accent_color: string(o, "accentColor")?,
    background_color: string(o, "backgroundColor")?,
    text_primary: string(o, "textPrimary")?,
    confidence: unit(o, "confidence")?,
  })
}

fn personality(o: &Object) -> Option<Value> {
  let tone = [
    "professional",
    "playful",
    "modern",
    "traditional",
    "minimalist",
    "bold",
  ];
  Some(json!({
    "tone": one_of(o, "tone", &tone)?,
    "energy": one_of(o, "energy", &["low", "medium", "high"])?,
    "targetAudience": string(o, "targetAudience")?,
  }))
}

fn design_system(o: &Object) -> Option<Value> {
  let frameworks = [
    "tailwind",
    "bootstrap",
    "material",
    "chakra",
    "custom",
    "unknown",
  ];
  Some(json!({
    "framework": one_of(o, "framework", &frameworks)?,
    "componentLibrary": string(o, "componentLibrary")?,
  }))
}

fn cleaned_fonts(fonts: &Value) -> Option<Vec<CleanedFont>> {
  let fonts = fonts.as_array().filter(|x| x.len() <= 5)?;
  let roles = ["heading", "body", "monospace", "display", "unknown"];
  fonts
    .iter()
    .map(|font| {
      let font = font.as_object()?;
      Some(CleanedFont {
        family: string(font, "family")?,
        role: one_of(font, "role", &roles)?,
      })
    })
    .collect()
}

fn logo_selection(o: &Object) -> Option<LlmLogoSelection> {
  Some(LlmLogoSelection {
    selected_logo_index: index(o, "selectedLogoIndex")?,
    selected_logo_reasoning: Some(string(o, "selectedLogoReasoning")?),
    confidence: unit(o, "confidence")?,
  })
}

/// The zod schema's parse: `None` when the answer doesn't validate. Without
/// logo candidates, `logoSelection` isn't in the schema and is stripped.
pub fn validate(answer: &Value, with_logo: bool) -> Option<BrandingEnhancement> {
  let o = answer.as_object()?;
  let fonts = match o.get("cleanedFonts") {
    None => Vec::new(),
    Some(fonts) => cleaned_fonts(fonts)?,
  };
  let logo_selection = match with_logo {
    true => Some(logo_selection(o.get("logoSelection")?.as_object()?)?),
    false => None,
  };
  Some(BrandingEnhancement {
    cleaned_fonts: fonts,
    button_classification: optional(o, "buttonClassification", button_classification)?
      .unwrap_or_else(ButtonClassification::not_returned),
    color_roles: color_roles(o.get("colorRoles")?.as_object()?)?,
    logo_selection,
    personality: optional(o, "personality", personality)?,
    design_system: optional(o, "designSystem", design_system)?,
  })
}

fn is_schema_node(node: &Value) -> bool {
  node
    .get("type")
    .and_then(Value::as_str)
    .is_some_and(|x| JSON_SCHEMA_TYPES.contains(&x))
}

/// A schema node's answer: its `example`, or its properties' answers.
fn value_from_schema_shape(node: &Value) -> Option<Value> {
  if !is_schema_node(node) {
    return Some(node.clone());
  }
  if let Some(example) = node.get("example") {
    return Some(example.clone());
  }
  properties_to_value(node.get("properties")?.as_object()?)
}

fn properties_to_value(properties: &Object) -> Option<Value> {
  properties
    .iter()
    .map(|(key, node)| Some((key.clone(), value_from_schema_shape(node)?)))
    .collect::<Option<Object>>()
    .map(Value::Object)
}

/// TS `unwrapSchemaShapedAnswer`: an answer given as
/// `{"type": ..., "properties": {...}}`, unwrapped. `None` unless every field
/// has an answer.
pub fn unwrap_schema_shaped_answer(text: &str) -> Option<Value> {
  let parsed: Value = serde_json::from_str(text).ok()?;
  parsed.get("type")?.as_str()?;
  properties_to_value(parsed.get("properties")?.as_object()?)
}

/// What `generateObject` returns: the parsed answer, or the repaired one when
/// the first fails to parse or validate. The flag says whether repair ran.
pub fn read_answer(text: &str, with_logo: bool) -> (Option<BrandingEnhancement>, bool) {
  let parsed = serde_json::from_str::<Value>(text)
    .ok()
    .and_then(|x| validate(&x, with_logo));
  if parsed.is_some() {
    return (parsed, false);
  }
  let repaired = unwrap_schema_shaped_answer(text).and_then(|x| validate(&x, with_logo));
  (repaired, true)
}
