//! TS `buildJevRequest`'s questions. Jev can't generate text, so every
//! branding decision is a pick from options built here.

use serde::Serialize;

use super::NONE;
use super::fonts::FontCandidate;
use super::ordered::Ordered;

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Question {
  Choice {
    instructions: String,
    criteria: Ordered<Option<&'static str>>,
  },
  Noul {
    instructions: String,
  },
}

const AUDIENCES: [&str; 16] = [
  "general consumers",
  "shoppers",
  "businesses",
  "small businesses",
  "enterprises",
  "developers",
  "creative professionals",
  "marketers",
  "students and educators",
  "patients and healthcare professionals",
  "investors and finance professionals",
  "donors and nonprofit supporters",
  "travelers",
  "gamers",
  "job seekers",
  "government and public-sector users",
];

fn choice(instructions: &str, criteria: Vec<(String, Option<&'static str>)>) -> Question {
  Question::Choice {
    instructions: instructions.to_string(),
    criteria: Ordered(criteria),
  }
}

/// Undescribed options, then `none` when it is allowed.
fn options(ids: &[String], none: Option<&'static str>) -> Vec<(String, Option<&'static str>)> {
  let mut options: Vec<_> = ids.iter().map(|id| (id.clone(), None)).collect();
  if let Some(none) = none {
    options.push((NONE.to_string(), Some(none)));
  }
  options
}

fn described(options: &[(&str, Option<&'static str>)]) -> Vec<(String, Option<&'static str>)> {
  options.iter().map(|(k, v)| (k.to_string(), *v)).collect()
}

fn ids(prefix: &str, n: usize) -> Vec<String> {
  (0..n).map(|i| format!("{prefix}_{i}")).collect()
}

fn color_questions(questions: &mut Vec<(String, Question)>, color_count: usize) {
  let colors = ids("color", color_count);
  let mut ask = |key: &str, instructions: &str, none: Option<&'static str>| {
    questions.push((
      key.to_string(),
      choice(instructions, options(&colors, none)),
    ));
  };
  ask(
    "primary_color",
    "Which entry in `colors` is the brand's main color: the distinctive color of its logo, primary buttons and highlights? Page chrome such as white or black backgrounds, gray text and borders is not the brand color unless the brand is deliberately monochrome.",
    None,
  );
  ask(
    "accent_color",
    "Which entry in `colors` is the accent color used for calls to action, highlights and links?",
    None,
  );
  ask(
    "secondary_color",
    "Which entry in `colors` is a secondary brand color, different from the main brand color and used for supporting brand elements? Choose none if the brand has no clear secondary color.",
    Some("The brand has no clear secondary color."),
  );
  ask(
    "background_color",
    "Which entry in `colors` is the main page background color?",
    None,
  );
  ask(
    "text_color",
    "Which entry in `colors` is the main body text color, the one most paragraphs are written in?",
    None,
  );
}

fn font_questions(questions: &mut Vec<(String, Question)>, fonts: &[FontCandidate]) {
  for (i, font) in fonts.iter().enumerate() {
    questions.push((
      format!("font_{i}_is_brand"),
      Question::Noul {
        instructions: format!(
          "Is `fonts.font_{i}` a real typeface this site uses for visible text, rather than an icon font, a fallback, or a generic family?"
        ),
      },
    ));
    // The page's typography already says what the font is for.
    if font.role.is_some() {
      continue;
    }
    let criteria = described(&[
      ("heading", Some("Headings and titles")),
      ("body", Some("Body text and paragraphs")),
      ("monospace", Some("Code or monospaced text")),
      ("display", Some("Large decorative display text or the logo")),
      ("unknown", Some("Cannot tell")),
    ]);
    questions.push((
      format!("font_{i}_role"),
      choice(
        &format!("What is `fonts.font_{i}` mainly used for on this site?"),
        criteria,
      ),
    ));
  }
}

fn style_questions(questions: &mut Vec<(String, Question)>) {
  let mut ask = |key: &str, instructions: &str, criteria: &[(&str, Option<&'static str>)]| {
    questions.push((key.to_string(), choice(instructions, described(criteria))));
  };
  ask(
    "tone",
    "Which word best describes the overall tone of this brand?",
    &[
      ("professional", None),
      ("playful", None),
      ("modern", None),
      ("traditional", None),
      ("minimalist", None),
      ("bold", None),
    ],
  );
  ask(
    "energy",
    "How much visual energy does this brand's design have?",
    &[
      ("low", Some("Calm, restrained")),
      ("medium", None),
      ("high", Some("Loud, vivid")),
    ],
  );
  let audiences: Vec<_> = AUDIENCES.iter().map(|a| (*a, None)).collect();
  ask("audience", "Who is this website mainly for?", &audiences);
  ask(
    "framework",
    "Which CSS framework does this site use, judging from `css.class_sample` and `css.framework_hints`?",
    &[
      (
        "tailwind",
        Some("Utility classes such as flex, items-center, px-4, bg-blue-500, rounded-lg"),
      ),
      (
        "bootstrap",
        Some("Classes such as btn, btn-primary, container, row, col-md-6"),
      ),
      ("material", Some("Mui* or mdc-* classes")),
      ("chakra", Some("chakra-* classes")),
      (
        "custom",
        Some("Its own class names that match no standard framework"),
      ),
      ("unknown", Some("Not enough evidence")),
    ],
  );
  ask(
    "component_library",
    "Which component library does this site use, judging from `css.class_sample` and `css.framework_hints`?",
    &[
      ("radix-ui", Some("radix-* data attributes or class names")),
      (
        "shadcn",
        Some("shadcn/ui conventions on top of Tailwind and Radix"),
      ),
      ("headless-ui", Some("headlessui-* identifiers")),
      ("mui", Some("Mui* classes")),
      ("chakra-ui", Some("chakra-* classes")),
      ("ant-design", Some("ant-* classes")),
      ("mantine", Some("mantine-* classes")),
      (NONE, Some("None of these, or not enough evidence")),
    ],
  );
}

/// The questions, in TS's order.
pub fn questions(
  logo_count: usize,
  button_ids: &[String],
  color_count: usize,
  fonts: &[FontCandidate],
) -> Ordered<Question> {
  let mut questions = Vec::new();
  if logo_count > 0 {
    questions.push((
      "logo".to_string(),
      choice(
        "Which entry in `logo_candidates` is this website's own primary brand logo: the mark of the brand named by `page` (title, URL, brand_name_hint), normally visible in the header and linking to the homepage? Menu, hamburger, close, social, partner, customer and payment icons are not the brand logo.",
        options(
          &ids("logo", logo_count),
          Some("No candidate is this website's own brand logo."),
        ),
      ),
    ));
  }
  if !button_ids.is_empty() {
    // No "none": when a page has buttons, one of them is the primary style.
    questions.push((
      "primary_button".to_string(),
      choice(
        "Which entry in `buttons` is the site's primary call-to-action button: the most prominent action a visitor is invited to take (such as Sign up, Get started, Buy, Book a demo, Donate)? Cookie-consent buttons are not calls to action.",
        options(button_ids, None),
      ),
    ));
    questions.push((
      "secondary_button".to_string(),
      choice(
        "Which entry in `buttons` is the secondary action button: a less prominent alternative to the primary one (such as Learn more, Contact sales, Log in), usually outlined, neutral or a different color?",
        options(button_ids, Some("There is no secondary button.")),
      ),
    ));
  }
  if color_count > 0 {
    color_questions(&mut questions, color_count);
  }
  font_questions(&mut questions, fonts);
  style_questions(&mut questions);
  Ordered(questions)
}
