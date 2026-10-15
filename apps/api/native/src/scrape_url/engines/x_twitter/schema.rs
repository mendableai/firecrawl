//! The JSON schemas Grok's structured output must follow.

use serde_json::{Value, json};

fn nullable(kind: &str) -> Value {
  json!({ "type": [kind, "null"] })
}

/// An object schema whose every property is required, as strict structured output demands.
fn object(properties: Value) -> Value {
  let required: Vec<&String> = properties
    .as_object()
    .map(|x| x.keys().collect())
    .unwrap_or_default();
  json!({
    "type": "object",
    "properties": properties,
    "required": required,
    "additionalProperties": false,
  })
}

pub fn profile_schema() -> Value {
  let post = object(json!({
    "text": { "type": "string" },
    "url": nullable("string"),
    "createdAt": nullable("string"),
    "likes": nullable("number"),
    "retweets": nullable("number"),
  }));
  object(json!({
    "displayName": nullable("string"),
    "username": nullable("string"),
    "profilePicUrl": nullable("string"),
    "bio": nullable("string"),
    "followers": nullable("number"),
    "accountVerified": nullable("boolean"),
    "url": nullable("string"),
    "latestPosts": { "type": "array", "maxItems": 5, "items": post },
  }))
}

pub fn post_schema() -> Value {
  let thread_post = object(json!({
    "authorDisplayName": nullable("string"),
    "authorUsername": nullable("string"),
    "text": { "type": "string" },
    "url": nullable("string"),
    "createdAt": nullable("string"),
    "likes": nullable("number"),
    "retweets": nullable("number"),
  }));
  let comment = object(json!({
    "authorDisplayName": nullable("string"),
    "authorUsername": nullable("string"),
    "text": { "type": "string" },
    "url": nullable("string"),
    "createdAt": nullable("string"),
    "likes": nullable("number"),
  }));
  object(json!({
    "authorDisplayName": nullable("string"),
    "authorUsername": nullable("string"),
    "text": { "type": "string" },
    "url": nullable("string"),
    "createdAt": nullable("string"),
    "likes": nullable("number"),
    "retweets": nullable("number"),
    "thread": { "type": "array", "items": thread_post },
    "comments": { "type": "array", "maxItems": 5, "items": comment },
  }))
}
