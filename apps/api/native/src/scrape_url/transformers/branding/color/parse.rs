//! culori's `parse.js`: the CSS color tokenizer, the modern (space-separated)
//! function syntax every color space parses from, and `color()`.

use super::super::js;
use super::{Color, Mode};

/// A channel value.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Coord {
  None,
  Number(f64),
  Percentage(f64),
  Hue(f64),
}

#[derive(Debug, Clone, PartialEq)]
pub enum Tok {
  Function(String),
  Ident(String),
  Coord(Coord),
  /// `/ <alpha>`; never a hue.
  Alpha(Coord),
  ParenClose,
  /// A number with a unit that is not a hue. culori pushes `undefined`, which
  /// throws once a function's coordinates are read.
  Invalid,
}

/// A thrown error inside culori's `parse`, which hexify turns into no color.
pub struct Thrown;

/// `[name, c1, c2, c3, alpha]` of a modern color function.
pub type Modern = (String, [Coord; 4]);

struct Chars {
  chars: Vec<char>,
  i: usize,
}

impl Chars {
  fn at(&self, offset: usize) -> Option<char> {
    self.chars.get(self.i + offset).copied()
  }

  fn digit_at(&self, offset: usize) -> bool {
    self.at(offset).is_some_and(|c| c.is_ascii_digit())
  }

  fn is_num(&self) -> bool {
    match self.at(0) {
      Some('-' | '+') => self.digit_at(1) || (self.at(1) == Some('.') && self.digit_at(2)),
      Some('.') => self.digit_at(1),
      _ => self.digit_at(0),
    }
  }

  fn is_ident(&self) -> bool {
    match self.at(0) {
      None => false,
      Some(c) if is_ident_start(c) => true,
      Some('-') => {
        self.chars.len() - self.i >= 2 && self.at(1).is_some_and(|c| c == '-' || is_ident_start(c))
      }
      Some(_) => false,
    }
  }

  fn take_while(&mut self, f: impl Fn(char) -> bool) -> String {
    let mut out = String::new();
    while let Some(c) = self.at(0).filter(|c| f(*c)) {
      out.push(c);
      self.i += 1;
    }
    out
  }

  fn num(&mut self) -> Tok {
    let mut value = String::new();
    if let Some(sign @ ('-' | '+')) = self.at(0) {
      value.push(sign);
      self.i += 1;
    }
    value += &self.take_while(|c| c.is_ascii_digit());
    if self.at(0) == Some('.') && self.digit_at(1) {
      self.i += 1;
      value.push('.');
      value += &self.take_while(|c| c.is_ascii_digit());
    }
    if let Some(e @ ('e' | 'E')) = self.at(0) {
      let signed = matches!(self.at(1), Some('-' | '+')) && self.digit_at(2);
      if signed || self.digit_at(1) {
        value.push(e);
        self.i += 1;
        if signed {
          value.extend(self.at(0));
          self.i += 1;
        }
        value += &self.take_while(|c| c.is_ascii_digit());
      }
    }
    let number = value.parse::<f64>().unwrap_or(f64::NAN);
    if self.is_ident() {
      return match self.take_while(is_ident_char).as_str() {
        "deg" => Tok::Coord(Coord::Hue(number)),
        "rad" => Tok::Coord(Coord::Hue(number * (180.0 / std::f64::consts::PI))),
        "grad" => Tok::Coord(Coord::Hue(number * (9.0 / 10.0))),
        "turn" => Tok::Coord(Coord::Hue(number * 360.0)),
        _ => Tok::Invalid,
      };
    }
    if self.at(0) == Some('%') {
      self.i += 1;
      return Tok::Coord(Coord::Percentage(number));
    }
    Tok::Coord(Coord::Number(number))
  }

  fn skip_spaces(&mut self) {
    self.take_while(|c| matches!(c, '\n' | '\t' | ' '));
  }

  /// The token after a `/`. `Ok(None)` is culori returning `undefined`.
  fn alpha(&mut self) -> Result<Option<Tok>, Thrown> {
    self.skip_spaces();
    if self.is_num() {
      match self.num() {
        Tok::Coord(Coord::Hue(_)) => {}
        Tok::Coord(coord) => return Ok(Some(Tok::Alpha(coord))),
        _ => return Err(Thrown),
      }
    }
    if self.is_ident() && self.take_while(is_ident_char) == "none" {
      return Ok(Some(Tok::Alpha(Coord::None)));
    }
    Ok(None)
  }
}

fn is_ident_start(c: char) -> bool {
  !c.is_ascii() || c.is_ascii_alphabetic() || c == '_'
}

fn is_ident_char(c: char) -> bool {
  !c.is_ascii() || c.is_ascii_alphanumeric() || c == '_' || c == '-'
}

/// culori's `tokenize`. `Ok(None)` is its `undefined`.
pub fn tokenize(s: &str) -> Result<Option<Vec<Tok>>, Thrown> {
  let mut chars = Chars {
    chars: js::trim(s).chars().collect(),
    i: 0,
  };
  let mut tokens = Vec::new();
  while let Some(c) = chars.at(0) {
    let token = match c {
      '\n' | '\t' | ' ' => {
        chars.skip_spaces();
        continue;
      }
      ')' => {
        chars.i += 1;
        Tok::ParenClose
      }
      '+' | '.' if chars.is_num() => chars.num(),
      '-' if chars.is_num() => chars.num(),
      '-' if chars.is_ident() => Tok::Ident(chars.take_while(is_ident_char)),
      '/' => {
        chars.i += 1;
        match chars.alpha()? {
          Some(token) => token,
          None => return Ok(None),
        }
      }
      c if c.is_ascii_digit() => chars.num(),
      c if is_ident_start(c) => {
        let ident = chars.take_while(is_ident_char);
        if chars.at(0) == Some('(') {
          chars.i += 1;
          Tok::Function(ident)
        } else if ident == "none" {
          Tok::Coord(Coord::None)
        } else {
          Tok::Ident(ident)
        }
      }
      _ => return Ok(None),
    };
    tokens.push(token);
  }
  Ok(Some(tokens))
}

/// culori's `consumeCoords`: three or four channels, the fourth an alpha.
fn consume_coords(tokens: &[Tok], include_hue: bool) -> Result<Option<[Coord; 4]>, Thrown> {
  let mut coords = Vec::new();
  for (i, token) in tokens.iter().enumerate() {
    match token {
      Tok::Coord(Coord::Hue(_)) if !include_hue => return Ok(None),
      Tok::Coord(_) | Tok::Alpha(_) => coords.push(token.clone()),
      Tok::ParenClose if i + 1 < tokens.len() => return Ok(None),
      Tok::ParenClose => {}
      Tok::Invalid => return Err(Thrown),
      Tok::Function(_) | Tok::Ident(_) => return Ok(None),
    }
  }
  let coord = |token: &Tok| match token {
    Tok::Coord(coord) => Some(*coord),
    _ => None,
  };
  let alpha = match coords.len() {
    3 => Coord::None,
    4 => match coords[3] {
      Tok::Alpha(alpha) => alpha,
      _ => return Ok(None),
    },
    _ => return Ok(None),
  };
  let [Some(a), Some(b), Some(c)] = [coord(&coords[0]), coord(&coords[1]), coord(&coords[2])]
  else {
    return Ok(None);
  };
  Ok(Some([a, b, c, alpha]))
}

/// culori's `parseModernSyntax`.
pub fn parse_modern(tokens: &[Tok]) -> Result<Option<Modern>, Thrown> {
  let Some(Tok::Function(name)) = tokens.first() else {
    return Ok(None);
  };
  Ok(consume_coords(&tokens[1..], true)?.map(|coords| (name.clone(), coords)))
}

fn alpha(coord: Coord) -> Option<f64> {
  match coord {
    Coord::None => None,
    Coord::Number(x) => Some(js::min(1.0, js::max(0.0, x))),
    Coord::Percentage(x) | Coord::Hue(x) => Some(js::min(1.0, js::max(0.0, x / 100.0))),
  }
}

/// A channel's value whatever its type; `none` stays undefined.
pub fn value(coord: Coord) -> Option<f64> {
  match coord {
    Coord::None => None,
    Coord::Number(x) | Coord::Percentage(x) | Coord::Hue(x) => Some(x),
  }
}

pub fn is_hue(coord: Coord) -> bool {
  matches!(coord, Coord::Hue(_))
}

pub fn is_percentage(coord: Coord) -> bool {
  matches!(coord, Coord::Percentage(_))
}

/// `Number ? x : percentage(x)`, culori's split for channels with a reference range.
pub fn scaled(coord: Coord, percentage: impl Fn(f64) -> f64) -> Option<f64> {
  match coord {
    Coord::None => None,
    Coord::Number(x) => Some(x),
    Coord::Percentage(x) | Coord::Hue(x) => Some(percentage(x)),
  }
}

/// A color of `mode`, with the alpha clamped as every culori parser does.
pub fn color(mode: Mode, channels: [Option<f64>; 3], a: Coord) -> Option<Color> {
  Some(Color {
    mode,
    channels,
    alpha: alpha(a),
  })
}

/// culori's `parseColorSyntax`: `color(<profile> c1 c2 c3 [/ alpha])`.
pub fn parse_color_syntax(tokens: &[Tok]) -> Result<Option<Color>, Thrown> {
  match tokens.first() {
    Some(Tok::Function(name)) if name == "color" => {}
    _ => return Ok(None),
  }
  let profile = match tokens.get(1) {
    Some(Tok::Ident(profile)) => profile.as_str(),
    Some(_) => return Ok(None),
    None => return Err(Thrown),
  };
  let mode = match profile {
    "srgb" => Mode::Rgb,
    "srgb-linear" => Mode::Lrgb,
    "display-p3" => Mode::P3,
    "a98-rgb" => Mode::A98,
    "prophoto-rgb" => Mode::Prophoto,
    "rec2020" => Mode::Rec2020,
    "xyz" | "xyz-d65" => Mode::Xyz65,
    "xyz-d50" => Mode::Xyz50,
    _ => return Ok(None),
  };
  let Some([c1, c2, c3, a]) = consume_coords(&tokens[2..], false)? else {
    return Ok(None);
  };
  let channel = |c: Coord| scaled(c, |x| x / 100.0);
  Ok(color(mode, [channel(c1), channel(c2), channel(c3)], a))
}
