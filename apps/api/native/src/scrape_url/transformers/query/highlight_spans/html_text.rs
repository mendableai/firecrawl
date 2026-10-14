//! The string helpers TS `highlight-spans.ts` gets from its libraries:
//! marked's `escape` and `he.decode`, plus JS's notion of whitespace.

use markup5ever::data::{C1_REPLACEMENTS, NAMED_ENTITIES};

/// Characters JS `\s` and `String.prototype.trim` treat as whitespace.
pub fn is_js_space(c: char) -> bool {
  matches!(
    c,
    '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'
      ..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'
  )
}

pub fn js_trim(text: &str) -> &str {
  text.trim_matches(is_js_space)
}

fn escape_char(c: char) -> Option<&'static str> {
  Some(match c {
    '&' => "&amp;",
    '<' => "&lt;",
    '>' => "&gt;",
    '"' => "&quot;",
    '\'' => "&#39;",
    _ => return None,
  })
}

/// marked's `escape(html, true)`.
pub fn escape_encode(text: &str) -> String {
  let mut out = String::with_capacity(text.len());
  for c in text.chars() {
    match escape_char(c) {
      Some(x) => out.push_str(x),
      None => out.push(c),
    }
  }
  out
}

/// marked's `escape(html)`: like [`escape_encode`], but an `&` that already
/// starts something shaped like a character reference stays.
pub fn escape_no_encode(text: &str) -> String {
  let mut out = String::with_capacity(text.len());
  for (i, c) in text.char_indices() {
    match escape_char(c) {
      Some(_) if c == '&' && looks_like_reference(&text[i + 1..]) => out.push(c),
      Some(x) => out.push_str(x),
      None => out.push(c),
    }
  }
  out
}

/// `(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);` at the start of `rest`.
fn looks_like_reference(rest: &str) -> bool {
  let (body, max) = if let Some(hex) = rest.strip_prefix("#x").or_else(|| rest.strip_prefix("#X")) {
    let digits = hex.bytes().take_while(u8::is_ascii_hexdigit).count();
    return (1..=6).contains(&digits) && hex[digits..].starts_with(';');
  } else if let Some(dec) = rest.strip_prefix('#') {
    (dec, 7)
  } else {
    let word = rest
      .bytes()
      .take_while(|b| b.is_ascii_alphanumeric() || *b == b'_')
      .count();
    return word > 0 && rest[word..].starts_with(';');
  };
  let digits = body.bytes().take_while(u8::is_ascii_digit).count();
  (1..=max).contains(&digits) && body[digits..].starts_with(';')
}

/// `he.decode` with its default (non-strict, non-attribute) options.
pub fn he_decode(text: &str) -> String {
  let mut out = String::with_capacity(text.len());
  let mut rest = text;
  while let Some(amp) = rest.find('&') {
    out.push_str(&rest[..amp]);
    let after = &rest[amp + 1..];
    match decode_reference(after) {
      Some((decoded, used)) => {
        out.push_str(&decoded);
        rest = &after[used..];
      }
      None => {
        out.push('&');
        rest = after;
      }
    }
  }
  out.push_str(rest);
  out
}

/// The text a reference right after an `&` decodes to, and how many bytes
/// of `after` it used.
fn decode_reference(after: &str) -> Option<(String, usize)> {
  let alnum = after.bytes().take_while(u8::is_ascii_alphanumeric).count();
  if alnum > 0 && after[alnum..].starts_with(';') {
    let key = &after[..=alnum];
    if let Some(decoded) = NAMED_ENTITIES.get(key).and_then(|x| entity_text(*x)) {
      return Some((decoded, alnum + 1));
    }
  }
  if let Some(legacy) = (1..=alnum).rev().find_map(|len| {
    NAMED_ENTITIES
      .get(&after[..len])
      .and_then(|x| entity_text(*x))
      .map(|x| (x, len))
  }) {
    return Some(legacy);
  }

  let (digits, radix, skip) = match after.strip_prefix('#') {
    Some(x) if x.starts_with(['x', 'X']) => (&x[1..], 16, 2),
    Some(x) => (x, 10, 1),
    None => return None,
  };
  let len = digits
    .bytes()
    .take_while(|b| (*b as char).is_digit(radix))
    .count();
  if len == 0 {
    return None;
  }
  let semicolon = usize::from(digits[len..].starts_with(';'));
  let code_point = u32::from_str_radix(&digits[..len], radix).unwrap_or(u32::MAX);
  Some((numeric_text(code_point), skip + len + semicolon))
}

fn entity_text((first, second): (u32, u32)) -> Option<String> {
  if first == 0 {
    return None;
  }
  Some(
    [first, second]
      .into_iter()
      .filter(|x| *x != 0)
      .filter_map(char::from_u32)
      .collect(),
  )
}

/// he's `codePointToSymbol`.
fn numeric_text(code_point: u32) -> String {
  let replaced = match code_point {
    0 => Some('\u{fffd}'),
    0x80..=0x9f => C1_REPLACEMENTS[(code_point - 0x80) as usize],
    _ => None,
  };
  replaced
    .or_else(|| char::from_u32(code_point))
    .unwrap_or('\u{fffd}')
    .to_string()
}
