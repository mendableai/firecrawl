//! TS `pipeline/postprocess.ts`: reconcile the extractor's raw output with the
//! target JSON schema.

use std::collections::HashSet;

use serde_json::{Map, Value};

use super::js;

/// TS `parseWithSchema`. `None` (JS `undefined`) passes through.
pub fn parse_with_schema(value: Option<Value>, schema: &Value) -> Option<Value> {
  let remapped = remap_keys(value?, Some(schema));
  let coerced = coerce_nulls(remapped, Some(schema), true);
  Some(dedupe_arrays(sanitize_strings(coerced)))
}

fn normalize_key(key: &str) -> String {
  key
    .chars()
    .filter(char::is_ascii_alphanumeric)
    .map(|c| c.to_ascii_lowercase())
    .collect()
}

fn properties(schema: &Map<String, Value>) -> Option<&Map<String, Value>> {
  schema.get("properties").and_then(Value::as_object)
}

/// Maps keys onto the schema's spelling when they match ignoring case and punctuation.
fn remap_keys(value: Value, schema: Option<&Value>) -> Value {
  let Some(Value::Object(schema)) = schema else {
    return value;
  };
  let object = match value {
    Value::Array(items) => {
      return Value::Array(
        items
          .into_iter()
          .map(|x| remap_keys(x, schema.get("items")))
          .collect(),
      );
    }
    Value::Object(object) => object,
    value => return value,
  };
  let Some(props) = properties(schema) else {
    return Value::Object(object);
  };

  let mut canonical: std::collections::HashMap<String, &String> = Default::default();
  for key in props.keys() {
    canonical.insert(normalize_key(key), key);
  }
  let mut out = Map::new();
  for (key, v) in object {
    let target = match props.contains_key(&key) {
      true => key,
      false => canonical
        .get(&normalize_key(&key))
        .map_or(key, |x| (*x).clone()),
    };
    let v = remap_keys(v, props.get(&target));
    out.insert(target, v);
  }
  Value::Object(out)
}

fn schema_allows_null(schema: &Map<String, Value>) -> bool {
  let nullable_type = match schema.get("type") {
    Some(Value::String(t)) => t == "null",
    Some(Value::Array(types)) => types.iter().any(|x| x == "null"),
    _ => false,
  };
  if nullable_type || schema.get("nullable") == Some(&Value::Bool(true)) {
    return true;
  }
  ["anyOf", "oneOf"].iter().any(|key| {
    schema
      .get(*key)
      .and_then(Value::as_array)
      .is_some_and(|branches| {
        branches
          .iter()
          .any(|b| b.as_object().is_some_and(schema_allows_null))
      })
  })
}

fn required_keys(schema: &Map<String, Value>) -> Vec<&str> {
  let mut out: Vec<&str> = Vec::new();
  for key in schema
    .get("required")
    .and_then(Value::as_array)
    .into_iter()
    .flatten()
    .filter_map(Value::as_str)
  {
    if !out.contains(&key) {
      out.push(key);
    }
  }
  out
}

/// The empty value of the schema's primary type.
fn type_default(schema: &Map<String, Value>) -> Value {
  let primary = match schema.get("type") {
    Some(Value::Array(types)) => types.iter().find(|x| *x != "null"),
    t => t,
  };
  match primary.and_then(Value::as_str) {
    Some("string") => Value::from(""),
    Some("number" | "integer") => Value::from(0),
    Some("boolean") => Value::Bool(false),
    Some("array") => Value::Array(Vec::new()),
    Some("object") => {
      let props = properties(schema);
      let mut out = Map::new();
      for key in required_keys(schema) {
        let default = match props.and_then(|x| x.get(key)).and_then(Value::as_object) {
          Some(sub) if !schema_allows_null(sub) => type_default(sub),
          _ => Value::Null,
        };
        out.insert(key.to_string(), default);
      }
      Value::Object(out)
    }
    _ => Value::Null,
  }
}

/// Fabricates a default only for a required, non-nullable null; drops optional nulls.
fn coerce_nulls(value: Value, schema: Option<&Value>, required: bool) -> Value {
  let Some(Value::Object(schema)) = schema else {
    return value;
  };
  let object = match value {
    Value::Null if schema_allows_null(schema) || !required => return Value::Null,
    Value::Null => return type_default(schema),
    Value::Array(items) => {
      let Some(item_schema) = schema.get("items").filter(|x| x.is_object()) else {
        return Value::Array(items);
      };
      return Value::Array(
        items
          .into_iter()
          .map(|x| coerce_nulls(x, Some(item_schema), true))
          .collect(),
      );
    }
    Value::Object(object) => object,
    value => return value,
  };
  let Some(props) = properties(schema) else {
    return Value::Object(object);
  };

  let required_keys: Vec<&str> = required_keys(schema);
  let mut out = Map::new();
  for (key, v) in object {
    let Some(sub) = props.get(&key) else {
      out.insert(key, v);
      continue;
    };
    let is_required = required_keys.contains(&key.as_str());
    let sub_allows_null = sub.as_object().is_some_and(schema_allows_null);
    if v.is_null() && !is_required && !sub_allows_null {
      continue;
    }
    let v = coerce_nulls(v, Some(sub), is_required);
    out.insert(key, v);
  }
  for key in required_keys {
    if !out.contains_key(key) {
      let default = props
        .get(key)
        .and_then(Value::as_object)
        .map_or(Value::Null, type_default);
      out.insert(key.to_string(), default);
    }
  }
  Value::Object(out)
}

/// Drops exact-duplicate objects and arrays from arrays; repeated scalars stay.
fn dedupe_arrays(value: Value) -> Value {
  match value {
    Value::Array(items) => {
      let mut seen = HashSet::new();
      let mut out = Vec::new();
      for item in items.into_iter().map(dedupe_arrays) {
        if (item.is_object() || item.is_array()) && !seen.insert(item.to_string()) {
          continue;
        }
        out.push(item);
      }
      Value::Array(out)
    }
    Value::Object(object) => Value::Object(
      object
        .into_iter()
        .map(|(k, v)| (k, dedupe_arrays(v)))
        .collect(),
    ),
    value => value,
  }
}

/// Icon-font glyphs, zero-width characters and control codes that ride along from the DOM.
fn is_junk(c: char) -> bool {
  matches!(c,
    '\u{0}'..='\u{8}'
      | '\u{B}'
      | '\u{C}'
      | '\u{E}'..='\u{1F}'
      | '\u{7F}'..='\u{9F}'
      | '\u{200B}'..='\u{200D}'
      | '\u{2060}'
      | '\u{FEFF}'
      | '\u{E000}'..='\u{F8FF}'
      | '\u{F0000}'..='\u{FFFFD}'
      | '\u{100000}'..='\u{10FFFD}')
}

/// Strips junk characters and collapses the doubled spaces they leave, keeping newlines.
fn sanitize_string(s: &str) -> String {
  let is_blank = |c: char| js::is_space(c) && c != '\r' && c != '\n';
  let mut out = String::with_capacity(s.len());
  let mut run = String::new();
  for c in s.chars().filter(|c| !is_junk(*c)) {
    if is_blank(c) {
      run.push(c);
      continue;
    }
    flush_run(&mut run, &mut out);
    out.push(c);
  }
  flush_run(&mut run, &mut out);
  js::trim(&out).to_string()
}

fn flush_run(run: &mut String, out: &mut String) {
  match run.chars().count() >= 2 {
    true => out.push(' '),
    false => out.push_str(run),
  }
  run.clear();
}

fn sanitize_strings(value: Value) -> Value {
  match value {
    Value::String(s) => Value::String(sanitize_string(&s)),
    Value::Array(items) => Value::Array(items.into_iter().map(sanitize_strings).collect()),
    Value::Object(object) => Value::Object(
      object
        .into_iter()
        .map(|(k, v)| (k, sanitize_strings(v)))
        .collect(),
    ),
    value => value,
  }
}
