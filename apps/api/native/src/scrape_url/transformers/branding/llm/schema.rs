//! TS `getBrandingEnhancementSchema`, as the JSON schema the AI SDK sends for it.

use serde_json::{Value, json};

fn unit(description: Option<&str>) -> Value {
  match description {
    Some(description) => {
      json!({ "description": description, "type": "number", "minimum": 0, "maximum": 1 })
    }
    None => json!({ "type": "number", "minimum": 0, "maximum": 1 }),
  }
}

fn described(kind: &str, description: &str) -> Value {
  json!({ "description": description, "type": kind })
}

fn one_of(description: &str, options: &[&str]) -> Value {
  json!({ "description": description, "type": "string", "enum": options })
}

fn object(properties: Value, required: &[&str]) -> Value {
  json!({
    "type": "object",
    "properties": properties,
    "required": required,
    "additionalProperties": false,
  })
}

/// `object` after one leading keyword, in the key order zod emits.
fn object_after(keyword: (&str, Value), properties: Value, required: &[&str]) -> Value {
  let mut schema = serde_json::Map::new();
  schema.insert(keyword.0.to_string(), keyword.1);
  if let Value::Object(rest) = object(properties, required) {
    schema.extend(rest);
  }
  Value::Object(schema)
}

fn button_classification() -> Value {
  object_after(
    (
      "default",
      json!({
        "primaryButtonIndex": -1,
        "primaryButtonReasoning": "LLM did not return button classification",
        "secondaryButtonIndex": -1,
        "secondaryButtonReasoning": "LLM did not return button classification",
        "confidence": 0,
      }),
    ),
    json!({
      "primaryButtonIndex": described("number", "REQUIRED: Index of the primary CTA button in the provided list (0-based), or -1 if none found. YOU MUST RETURN THIS FIELD."),
      "primaryButtonReasoning": described("string", "REQUIRED: Why this button was selected as primary. YOU MUST RETURN THIS FIELD."),
      "secondaryButtonIndex": described("number", "REQUIRED: Index of the secondary button in the provided list (0-based), or -1 if none found. YOU MUST RETURN THIS FIELD."),
      "secondaryButtonReasoning": described("string", "REQUIRED: Why this button was selected as secondary. YOU MUST RETURN THIS FIELD."),
      "confidence": unit(Some("REQUIRED: Confidence in button classification (0-1). YOU MUST RETURN THIS FIELD.")),
    }),
    &[
      "primaryButtonIndex",
      "primaryButtonReasoning",
      "secondaryButtonIndex",
      "secondaryButtonReasoning",
      "confidence",
    ],
  )
}

fn color_roles() -> Value {
  object(
    json!({
      "primaryColor": described("string", "Main brand color (hex)"),
      "secondaryColor": described("string", "Secondary brand color (hex) - a complementary color distinct from primary, often used for secondary UI elements, headings, or supporting brand visuals. Omit or return empty string if no clear secondary color exists."),
      "accentColor": described("string", "Accent/CTA color (hex)"),
      "backgroundColor": described("string", "Main background color (hex)"),
      "textPrimary": described("string", "Primary text color (hex)"),
      "confidence": unit(None),
    }),
    &[
      "primaryColor",
      "accentColor",
      "backgroundColor",
      "textPrimary",
      "confidence",
    ],
  )
}

fn cleaned_fonts() -> Value {
  json!({
    "default": [],
    "description": "Top 5 cleaned fonts (remove obfuscation, fallbacks, generics, CSS vars)",
    "maxItems": 5,
    "type": "array",
    "items": object(
      json!({
        "family": described("string", "Cleaned, human-readable font name"),
        "role": one_of("Font role/usage", &["heading", "body", "monospace", "display", "unknown"]),
      }),
      &["family", "role"],
    ),
  })
}

fn logo_selection() -> Value {
  object(
    json!({
      "selectedLogoIndex": described("number", "REQUIRED: Index of the selected logo in the provided candidates list (0-based), or -1 if NONE of the candidates match the site's brand. Infer the brand from page title/URL when provided (e.g. 'X | Miro' → brand Miro). YOU MUST RETURN A NUMBER."),
      "selectedLogoReasoning": described("string", "REQUIRED: Detailed explanation of why this logo was selected, or why none were suitable if returning -1. YOU MUST PROVIDE REASONING."),
      "confidence": unit(Some("REQUIRED: Confidence in logo selection (0-1). Return 0 if no suitable logo found.")),
    }),
    &["selectedLogoIndex", "selectedLogoReasoning", "confidence"],
  )
}

/// The schema with `logoSelection` only when there are logo candidates.
pub fn response_schema(with_logo: bool) -> Value {
  let mut properties = json!({
    "buttonClassification": button_classification(),
    "colorRoles": color_roles(),
    "personality": object(
      json!({
        "tone": one_of("Overall brand tone", &["professional", "playful", "modern", "traditional", "minimalist", "bold"]),
        "energy": one_of("Visual energy level", &["low", "medium", "high"]),
        "targetAudience": described("string", "Perceived target audience"),
      }),
      &["tone", "energy", "targetAudience"],
    ),
    "designSystem": object(
      json!({
        "framework": one_of("Detected CSS framework", &["tailwind", "bootstrap", "material", "chakra", "custom", "unknown"]),
        "componentLibrary": described("string", "Detected component library (e.g., radix-ui, shadcn)"),
      }),
      &["framework", "componentLibrary"],
    ),
    "cleanedFonts": cleaned_fonts(),
  });
  let mut required = vec!["colorRoles"];
  if with_logo && let Value::Object(map) = &mut properties {
    map.insert("logoSelection".to_string(), logo_selection());
    required.push("logoSelection");
  }
  object_after(
    (
      "$schema",
      Value::from("http://json-schema.org/draft-07/schema#"),
    ),
    properties,
    &required,
  )
}
