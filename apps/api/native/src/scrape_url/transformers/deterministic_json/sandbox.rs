//! TS `sandboxRunner` and `runExtractorInSandbox`: run the harness in the
//! code-sandbox over a WebSocket and answer its `askLlm` host calls.

use std::time::Duration;

use futures_util::{SinkExt, StreamExt, stream::FuturesUnordered};
use serde_json::{Map, Value, json};
use tokio::net::{TcpStream, lookup_host};
use tokio_tungstenite::{
  WebSocketStream, client_async,
  tungstenite::{Error as WsError, Message, error::ProtocolError},
};
use tracing::{Span, field::Empty, instrument};
use url::Url;

use super::{
  DeterministicJsonError, ask_llm::AskLlm, config::SANDBOX_TIMEOUT_MS, harness::EXTRACTOR_HARNESS,
};

/// TS `runExtractorInSandbox`. `None` is a result frame without a value.
#[instrument(
  name = "deterministic_json::run_extractor_in_sandbox",
  skip_all,
  fields(host_calls = Empty),
  err
)]
pub async fn run_extractor_in_sandbox(
  endpoint: &str,
  code: &str,
  html: &str,
  url: &str,
  ask: &AskLlm,
) -> Result<Option<Value>, DeterministicJsonError> {
  let run = json!({
    "type": "run",
    "code": EXTRACTOR_HARNESS,
    "input": { "code": code, "html": html, "url": url },
  });
  tokio::time::timeout(
    Duration::from_millis(SANDBOX_TIMEOUT_MS),
    session(endpoint, run.to_string(), ask),
  )
  .await
  .unwrap_or_else(|_| Err(format!("sandbox timed out after {SANDBOX_TIMEOUT_MS}ms")))
  .map_err(DeterministicJsonError::Sandbox)
}

async fn session(endpoint: &str, run: String, ask: &AskLlm) -> Result<Option<Value>, String> {
  let mut ws = connect(endpoint).await?;
  ws.send(Message::text(run)).await.map_err(stream_error)?;

  let mut host_calls = 0;
  let mut pending = FuturesUnordered::new();
  let outcome = loop {
    tokio::select! {
      message = ws.next() => {
        let text = match message {
          None | Some(Ok(Message::Close(_))) => break Err(CLOSED.to_string()),
          Some(Err(e)) => break Err(stream_error(e)),
          Some(Ok(Message::Text(text))) => text.to_string(),
          Some(Ok(Message::Binary(bytes))) => String::from_utf8_lossy(&bytes).into_owned(),
          Some(Ok(_)) => continue,
        };
        let Ok(frame) = serde_json::from_str::<Value>(&text) else {
          continue;
        };
        match frame.get("type").and_then(Value::as_str) {
          Some("host") => {
            host_calls += 1;
            pending.push(host_reply(frame, ask));
          }
          Some("result") => break Ok(frame.get("value").cloned()),
          Some("error") => break Err(error_message(frame.get("message"))),
          _ => {}
        }
      }
      Some(reply) = pending.next(), if !pending.is_empty() => {
        // TS only replies while the socket is open.
        let _ = ws.send(Message::text(reply)).await;
      }
    }
  };
  Span::current().record("host_calls", host_calls);
  let _ = ws.close(None).await;
  outcome
}

const CLOSED: &str = "sandbox connection closed";

/// After the handshake, Node's `ws` reports a dropped socket only as `close`;
/// bad frames still surface as errors.
fn stream_error(e: WsError) -> String {
  match e {
    WsError::ConnectionClosed
    | WsError::AlreadyClosed
    | WsError::Io(_)
    | WsError::Protocol(ProtocolError::ResetWithoutClosingHandshake) => CLOSED.to_string(),
    e => e.to_string(),
  }
}

/// Connects like Node's `ws`, with its messages for the usual failures.
async fn connect(endpoint: &str) -> Result<WebSocketStream<TcpStream>, String> {
  let invalid = || format!("Invalid URL: {endpoint}");
  let url = Url::parse(endpoint).map_err(|_| invalid())?;
  if url.scheme() != "ws" {
    return Err(format!("unsupported sandbox URL scheme: {}", url.scheme()));
  }
  let host = url.host_str().ok_or_else(invalid)?;
  let port = url.port_or_known_default().unwrap_or(80);
  let addr = lookup_host((host.trim_start_matches('[').trim_end_matches(']'), port))
    .await
    .ok()
    .and_then(|mut x| x.next())
    .ok_or_else(|| format!("getaddrinfo ENOTFOUND {host}"))?;
  let stream = TcpStream::connect(addr).await.map_err(|e| match e.kind() {
    std::io::ErrorKind::ConnectionRefused => format!("connect ECONNREFUSED {addr}"),
    _ => e.to_string(),
  })?;
  let (ws, _) = client_async(endpoint, stream).await.map_err(|e| match e {
    WsError::Http(response) => {
      format!("Unexpected server response: {}", response.status().as_u16())
    }
    e => e.to_string(),
  })?;
  Ok(ws)
}

/// Answers one `host` frame with a `hostResult` frame.
async fn host_reply(frame: Value, ask: &AskLlm) -> String {
  let channel = frame.get("channel");
  let result = match channel.and_then(Value::as_str) {
    Some("askLlm") => {
      let payload = frame.get("payload");
      let field = |name| payload.and_then(|x| x.get(name)).filter(|x| !x.is_null());
      let prompt = field("prompt").map(js_string).unwrap_or_default();
      Ok(ask.ask(prompt, field("schema").cloned()).await)
    }
    _ => Err(format!(
      "unknown sandbox channel: {}",
      channel.map_or("undefined".to_string(), js_string)
    )),
  };
  let mut reply = Map::new();
  reply.insert("type".to_string(), Value::from("hostResult"));
  if let Some(id) = frame.get("id") {
    reply.insert("id".to_string(), id.clone());
  }
  match result {
    Ok(value) => reply.insert("value".to_string(), value),
    Err(error) => reply.insert("error".to_string(), Value::from(error)),
  };
  Value::Object(reply).to_string()
}

/// `new Error(frame.message).message`.
fn error_message(message: Option<&Value>) -> String {
  message.map(js_string).unwrap_or_default()
}

/// JS `String(value)` for a JSON value.
fn js_string(value: &Value) -> String {
  match value {
    Value::String(s) => s.clone(),
    Value::Null => "null".to_string(),
    Value::Array(items) => items
      .iter()
      .map(|x| match x {
        Value::Null => String::new(),
        x => js_string(x),
      })
      .collect::<Vec<_>>()
      .join(","),
    Value::Object(_) => "[object Object]".to_string(),
    value => value.to_string(),
  }
}
