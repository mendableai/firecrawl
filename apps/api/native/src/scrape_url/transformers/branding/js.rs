//! JS number and string semantics the TS branding code relies on.

/// `Math.round`: halves round toward +Infinity.
pub fn round(x: f64) -> f64 {
  let floor = x.floor();
  if x - floor >= 0.5 { floor + 1.0 } else { floor }
}

/// `Math.max(a, b)`, which is NaN when either side is.
pub fn max(a: f64, b: f64) -> f64 {
  if a.is_nan() || b.is_nan() {
    f64::NAN
  } else {
    a.max(b)
  }
}

/// `Math.min(a, b)`, which is NaN when either side is.
pub fn min(a: f64, b: f64) -> f64 {
  if a.is_nan() || b.is_nan() {
    f64::NAN
  } else {
    a.min(b)
  }
}

/// `Math.sign`, which keeps zero instead of returning 1.
pub fn sign(x: f64) -> f64 {
  if x == 0.0 || x.is_nan() {
    x
  } else {
    x.signum()
  }
}

/// `Math.hypot` as V8 computes it: scaled by the largest value, Kahan-summed.
pub fn hypot(values: &[f64]) -> f64 {
  let abs: Vec<f64> = values.iter().map(|x| x.abs()).collect();
  if abs.iter().any(|x| x.is_infinite()) {
    return f64::INFINITY;
  }
  if abs.iter().any(|x| x.is_nan()) {
    return f64::NAN;
  }
  let max = abs.iter().copied().fold(0.0, f64::max);
  if max == 0.0 {
    return 0.0;
  }
  let (mut sum, mut compensation) = (0.0_f64, 0.0_f64);
  for x in abs {
    let n = x / max;
    let summand = n * n - compensation;
    let preliminary = sum + summand;
    compensation = (preliminary - sum) - summand;
    sum = preliminary;
  }
  sum.sqrt() * max
}

/// `String(x)` for a number.
pub fn number_to_string(x: f64) -> String {
  if x.is_nan() {
    return "NaN".to_string();
  }
  if x.is_infinite() {
    return if x > 0.0 { "Infinity" } else { "-Infinity" }.to_string();
  }
  if x == 0.0 {
    return "0".to_string();
  }
  if (1e-6..1e21).contains(&x.abs()) {
    return format!("{x}");
  }
  let exp = format!("{x:e}");
  match exp.split_once('e') {
    Some((mantissa, power)) if !power.starts_with('-') => format!("{mantissa}e+{power}"),
    _ => exp,
  }
}

/// JS whitespace and line terminators, what `trim()` and `\s` match.
pub fn is_space(c: char) -> bool {
  c == '\u{feff}' || (c.is_whitespace() && c != '\u{85}')
}

/// `String.prototype.trim`.
pub fn trim(s: &str) -> &str {
  s.trim_matches(is_space)
}

/// `s.replace(/\s+/g, "")`.
pub fn strip_spaces(s: &str) -> String {
  s.chars().filter(|c| !is_space(*c)).collect()
}

/// `s.split(/\s+/)`, which keeps the empty strings an edge space leaves.
pub fn split_spaces(s: &str) -> Vec<&str> {
  let parts: Vec<&str> = s.split(is_space).collect();
  let last = parts.len() - 1;
  parts
    .into_iter()
    .enumerate()
    .filter(|(i, part)| *i == 0 || *i == last || !part.is_empty())
    .map(|(_, part)| part)
    .collect()
}

/// `s.length`, in UTF-16 units.
pub fn len(s: &str) -> usize {
  s.encode_utf16().count()
}

/// `x.toFixed(digits)`: like Rust's formatting except that exact ties round
/// away from zero instead of to even.
pub fn to_fixed(x: f64, digits: usize) -> String {
  if !x.is_finite() {
    return number_to_string(x);
  }
  let exact = format!("{:.*}", digits + 30, x.abs());
  let cut = exact.len() - 30;
  let is_tie = exact[cut..].starts_with('5') && exact[cut + 1..].bytes().all(|b| b == b'0');
  let rounded = if is_tie {
    format!(
      "{:.*}",
      digits,
      x.abs() + 0.5 * 10f64.powi(-(digits as i32))
    )
  } else {
    format!("{:.*}", digits, x.abs())
  };
  if x < 0.0 {
    format!("-{rounded}")
  } else {
    rounded
  }
}

/// `s.slice(start, end)` in UTF-16 units. Half of a surrogate pair at either
/// edge becomes U+FFFD, since a Rust string can't hold a lone surrogate.
pub fn slice_utf16(s: &str, start: usize, end: usize) -> String {
  let mut out = String::new();
  let mut unit = 0;
  for c in s.chars() {
    let (from, to) = (unit, unit + c.len_utf16());
    unit = to;
    if to <= start || from >= end {
      continue;
    }
    out.push(if from >= start && to <= end {
      c
    } else {
      '\u{fffd}'
    });
  }
  out
}
