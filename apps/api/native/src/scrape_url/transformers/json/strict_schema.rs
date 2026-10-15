//! Port of TS `lib/openai-strict-schema.ts`. OpenAI structured outputs (strict
//! mode) accept a subset of JSON Schema: this fixes the mechanical mistakes in
//! user-written and LLM-generated schemas, and names what strict mode rejects.

use serde_json::{Map, Value, json};

use super::super::tokens::utf16_prefix;

const JSON_SCHEMA_TYPES: &[&str] = &[
  "string", "number", "integer", "boolean", "object", "array", "null",
];

/// Rejected by strict mode wherever they appear.
const UNSUPPORTED_KEYWORDS: &[&str] = &[
  "allOf",
  "oneOf",
  "not",
  "if",
  "then",
  "else",
  "dependentRequired",
  "dependentSchemas",
];

/// Annotations that can sit next to the fields of a bare map. Any other key is a property name.
const ROOT_ANNOTATIONS: &[&str] = &["$schema", "$id", "$comment"];

pub fn type_includes(schema_type: Option<&Value>, name: &str) -> bool {
  match schema_type {
    Some(Value::String(x)) => x == name,
    Some(Value::Array(types)) => types.iter().any(|x| x.as_str() == Some(name)),
    _ => false,
  }
}

fn lowercase_type(schema_type: &Value) -> Value {
  match schema_type {
    Value::String(x) => Value::String(x.to_lowercase()),
    Value::Array(types) => types
      .iter()
      .map(|x| match x {
        Value::String(x) => Value::String(x.to_lowercase()),
        other => other.clone(),
      })
      .collect(),
    other => other.clone(),
  }
}

/// Whether a typeless root is a schema rather than a bare map of property names to schemas.
fn is_typeless_root_schema(node: &Map<String, Value>) -> bool {
  let Some(Value::Object(properties)) = node.get("properties") else {
    return false;
  };
  if properties.get("type").is_some_and(Value::is_string) {
    return false;
  }
  node.iter().all(|(key, value)| match key.as_str() {
    "$schema" | "$id" | "$comment" | "title" | "description" => value.is_string(),
    "required" => value.is_array(),
    "additionalProperties" => value.is_boolean(),
    "properties" | "$defs" | "definitions" => value.is_object(),
    _ => false,
  })
}

fn is_bare_root_map(node: &Value) -> Option<&Map<String, Value>> {
  let node = node.as_object()?;
  let has = |key| node.contains_key(key);
  (!has("type") && !has("anyOf") && !has("oneOf") && !has("$ref") && !is_typeless_root_schema(node))
    .then_some(node)
}

fn map_values(map: &Map<String, Value>, f: impl Fn(&Value) -> Value) -> Value {
  Value::Object(map.iter().map(|(k, v)| (k.clone(), f(v))).collect())
}

/// Lowercases type names, turns oneOf into anyOf, and fills in a missing type
/// when properties or items make it unambiguous.
pub fn normalize_schema_keywords(schema: &Value) -> Value {
  normalize_node(schema, true)
}

fn normalize_node(node: &Value, is_root: bool) -> Value {
  let Value::Object(node) = node else {
    return node.clone();
  };
  let mut out = node.clone();

  if let Some(schema_type) = out.get_mut("type") {
    *schema_type = lowercase_type(schema_type);
  }

  if out.get("oneOf").is_some_and(Value::is_array)
    && !out.contains_key("anyOf")
    && let Some(one_of) = out.shift_remove("oneOf")
  {
    out.insert("anyOf".to_string(), one_of);
  }

  if !out.contains_key("type") {
    let is_object = if is_root {
      is_typeless_root_schema(&out)
    } else {
      out.get("properties").is_some_and(Value::is_object)
    };
    if is_object {
      out.insert("type".to_string(), json!("object"));
    } else if !is_root && out.get("items").is_some_and(Value::is_object) {
      out.insert("type".to_string(), json!("array"));
    }
  }

  if let Some(Value::Object(properties)) = out.get("properties") {
    let properties = map_values(properties, |v| normalize_node(v, false));
    out.insert("properties".to_string(), properties);
  }
  if let Some(items) = out.get("items").filter(|x| x.is_object()) {
    let items = normalize_node(items, false);
    out.insert("items".to_string(), items);
  }
  if let Some(Value::Array(any_of)) = out.get("anyOf") {
    let any_of = any_of.iter().map(|v| normalize_node(v, false)).collect();
    out.insert("anyOf".to_string(), any_of);
  }
  // Strict mode closes every object, so a schema for keys beyond "properties" is dropped.
  if let Some(additional) = out.get("additionalProperties").filter(|x| x.is_object()) {
    let additional = match out.get("properties").is_some_and(Value::is_object) {
      true => Value::Bool(false),
      false => normalize_node(additional, false),
    };
    out.insert("additionalProperties".to_string(), additional);
  }
  for defs_key in ["$defs", "definitions"] {
    if let Some(Value::Object(defs)) = out.get(defs_key) {
      let defs = map_values(defs, |v| normalize_node(v, false));
      out.insert(defs_key.to_string(), defs);
    }
  }

  Value::Object(out)
}

/// [`normalize_schema_keywords`], plus turning a bare map of property names to
/// schemas into an object schema, with its `$defs` moved to that schema's root.
pub fn to_root_schema(schema: &Value) -> Value {
  let Some(map) = is_bare_root_map(schema) else {
    return normalize_schema_keywords(schema);
  };
  let defs = map.get("$defs").filter(|x| {
    x.as_object()
      .is_some_and(|x| !x.get("type").is_some_and(Value::is_string))
  });
  let entries: Map<String, Value> = map
    .iter()
    .filter(|(key, _)| !(defs.is_some() && key.as_str() == "$defs"))
    .filter(|(key, _)| !ROOT_ANNOTATIONS.contains(&key.as_str()))
    .map(|(k, v)| (k.clone(), v.clone()))
    .collect();
  let required: Vec<&String> = entries.keys().collect();
  let mut root = json!({
    "type": "object",
    "properties": entries,
    "required": required,
    "additionalProperties": false,
  });
  if let (Some(defs), Value::Object(root)) = (defs, &mut root) {
    root.insert("$defs".to_string(), defs.clone());
  }
  normalize_schema_keywords(&root)
}

fn describe(value: Option<&Value>) -> String {
  let json = value.map_or_else(|| "undefined".to_string(), Value::to_string);
  if json.encode_utf16().count() > 60 {
    format!("{}...", utf16_prefix(&json, 57))
  } else {
    json
  }
}

/// The first construct OpenAI strict structured outputs rejects, described for
/// a person, or `None` when there is none.
pub fn find_strict_schema_violation(schema: &Value) -> Option<String> {
  if schema.is_null() {
    return None;
  }
  let root = to_root_schema(schema);
  let Value::Object(map) = &root else {
    return Some(format!(
      "Invalid JSON schema: expected an object, got {}.",
      describe(Some(&root))
    ));
  };

  if !map.contains_key("$ref") {
    if map.contains_key("anyOf") {
      return Some(
        "Invalid JSON schema: the root must be an object or array schema, not \"anyOf\"."
          .to_string(),
      );
    }
    let schema_type = map.get("type");
    if !type_includes(schema_type, "object") && !type_includes(schema_type, "array") {
      return Some(format!(
        "Invalid JSON schema: the root must be an object or array schema, got type {}.",
        describe(schema_type)
      ));
    }
  }

  check_node(&root, "")
}

fn check_node(node: &Value, path: &str) -> Option<String> {
  let at = if path.is_empty() {
    String::new()
  } else {
    format!(" at \"{path}\"")
  };
  let child = |segment: String| match path {
    "" => segment,
    _ => format!("{path}.{segment}"),
  };

  let Value::Object(map) = node else {
    return Some(format!(
      "Invalid JSON schema{at}: expected a schema object, got {}.",
      describe(Some(node))
    ));
  };

  if let Some(keyword) = UNSUPPORTED_KEYWORDS.iter().find(|x| map.contains_key(**x)) {
    return Some(format!(
      "Invalid JSON schema{at}: \"{keyword}\" is not supported for JSON extraction."
    ));
  }

  if let Some(violation) = check_type(map, &at) {
    return Some(violation);
  }

  if let Some(Value::Object(properties)) = map.get("properties") {
    for (key, value) in properties {
      if let Some(violation) = check_node(value, &child(format!("properties.{key}"))) {
        return Some(violation);
      }
    }
  }

  if let Some(items) = map.get("items").filter(|x| x.is_object())
    && let Some(violation) = check_node(items, &child("items".to_string()))
  {
    return Some(violation);
  }

  match map.get("anyOf") {
    Some(Value::Array(any_of)) => {
      for (i, variant) in any_of.iter().enumerate() {
        if let Some(violation) = check_node(variant, &child(format!("anyOf.{i}"))) {
          return Some(violation);
        }
      }
    }
    Some(other) => {
      return Some(format!(
        "Invalid JSON schema{at}: \"anyOf\" must be an array, got {}.",
        describe(Some(other))
      ));
    }
    None => {}
  }

  for defs_key in ["$defs", "definitions"] {
    if let Some(Value::Object(defs)) = map.get(defs_key) {
      for (key, value) in defs {
        if let Some(violation) = check_node(value, &child(format!("{defs_key}.{key}"))) {
          return Some(violation);
        }
      }
    }
  }

  None
}

/// The checks of TS `checkNode` on a node's own type, items and properties shape.
fn check_type(map: &Map<String, Value>, at: &str) -> Option<String> {
  // A reference takes its type from the definition it points to.
  let is_reference = map.contains_key("$ref");
  let has = |key| map.contains_key(key);

  if !is_reference && !has("type") && !has("anyOf") && !has("enum") && !has("const") {
    return Some(format!("Invalid JSON schema{at}: missing \"type\"."));
  }

  if let Some(schema_type) = map.get("type") {
    let types = match schema_type {
      Value::Array(types) => types.iter().collect(),
      other => vec![other],
    };
    let invalid = types
      .iter()
      .any(|x| !x.as_str().is_some_and(|x| JSON_SCHEMA_TYPES.contains(&x)));
    if types.is_empty() || invalid {
      return Some(format!(
        "Invalid JSON schema{at}: \"type\" must be one of {}, got {}.",
        JSON_SCHEMA_TYPES.join(", "),
        describe(Some(schema_type))
      ));
    }
  }

  let schema_type = map.get("type");
  if !is_reference
    && type_includes(schema_type, "array")
    && !map.get("items").is_some_and(Value::is_object)
  {
    return Some(match map.get("items") {
      None => format!("Invalid JSON schema{at}: arrays must define \"items\"."),
      Some(items) => format!(
        "Invalid JSON schema{at}: \"items\" must be a single schema object, got {}.",
        describe(Some(items))
      ),
    });
  }

  if type_includes(schema_type, "object")
    && !has("properties")
    && map
      .get("additionalProperties")
      .is_some_and(Value::is_object)
  {
    return Some(format!(
      "Invalid JSON schema{at}: objects must list their \"properties\"; a dictionary described only by \"additionalProperties\" is not supported for JSON extraction."
    ));
  }

  match map.get("properties") {
    Some(properties) if !properties.is_object() => Some(format!(
      "Invalid JSON schema{at}: \"properties\" must be an object, got {}.",
      describe(Some(properties))
    )),
    _ => None,
  }
}
