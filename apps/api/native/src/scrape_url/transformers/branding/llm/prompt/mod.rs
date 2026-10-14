//! TS `buildBrandingPrompt`: the page's profile, buttons, logo candidates and
//! background candidates, with what the model has to decide about them.

mod logo;
mod tasks;

use std::collections::HashSet;

use serde_json::Value;

use super::super::{color, js};
use super::LlmInput;

/// TS `sanitize`: untrusted text on one line, without backticks, with quotes
/// escaped, cut to `max` UTF-16 units.
pub fn sanitize(s: Option<&str>, max: usize) -> String {
  let Some(s) = s.filter(|x| !x.is_empty()) else {
    return String::new();
  };
  let mut out = String::with_capacity(s.len());
  let mut in_break = false;
  for c in s.chars() {
    if matches!(c, '\r' | '\n') {
      if !in_break {
        out.push(' ');
      }
      in_break = true;
      continue;
    }
    in_break = false;
    match c {
      '\u{0}'..='\u{1f}' | '\u{7f}' | '`' => {}
      '"' => out.push_str("\\\""),
      c => out.push(c),
    }
  }
  js::slice_utf16(js::trim(&out), 0, max)
}

/// `String(x)` for a value the script sent; `None` is `undefined`.
fn js_string(value: Option<&Value>) -> String {
  match value {
    None => "undefined".to_string(),
    Some(Value::Null) => "null".to_string(),
    Some(Value::String(x)) => x.clone(),
    Some(Value::Number(x)) => js::number_to_string(x.as_f64().unwrap_or(f64::NAN)),
    Some(Value::Bool(x)) => x.to_string(),
    Some(Value::Array(x)) => x
      .iter()
      .map(|x| match x {
        Value::Null => String::new(),
        x => js_string(Some(x)),
      })
      .collect::<Vec<_>>()
      .join(","),
    Some(Value::Object(_)) => "[object Object]".to_string(),
  }
}

/// TS `getColorInfo`: how the prompt describes a button background.
fn color_info(s: &str) -> (bool, &'static str) {
  if s.is_empty() || s == "transparent" {
    return (false, "transparent");
  }
  let [r, g, b] = color::parse(s).map_or([0.0; 3], |x| {
    let rgb = color::to_rgb(&x);
    [rgb.r, rgb.g, rgb.b].map(|c| js::round(c.unwrap_or(0.0) * 255.0))
  });
  let max = js::max(r, js::max(g, b));
  let min = js::min(r, js::min(g, b));
  let saturation = if max == 0.0 { 0.0 } else { (max - min) / max };
  let vibrant = saturation > 0.3 && max / 255.0 > 0.2;
  let description = if g > r && g > b && g > 100.0 {
    "green"
  } else if b > r && b > g && b > 100.0 {
    "blue"
  } else if r > g && r > b && r > 100.0 {
    "red/orange"
  } else if max < 50.0 {
    "dark"
  } else if min > 200.0 {
    "light/white"
  } else {
    "neutral"
  };
  (vibrant, description)
}

/// The fields the prompt reads more than once.
struct Context<'a> {
  input: &'a LlmInput<'a>,
  brand: String,
  display_url: &'a str,
  has_page_context: bool,
}

pub fn build_prompt(input: &LlmInput) -> String {
  let title = sanitize(input.page_title, 200);
  let display_url = input
    .page_url
    .filter(|x| !x.is_empty())
    .unwrap_or(&input.url);
  let cx = Context {
    input,
    brand: sanitize(input.brand_name, 80),
    display_url,
    has_page_context: !title.is_empty() || !display_url.is_empty(),
  };

  let mut p = "Analyze the branding of this website".to_string();
  if !display_url.is_empty() {
    p.push_str(&format!(": {display_url}"));
  }
  p.push_str("\n\n");
  page_context(&mut p, &cx, &title);
  if input.logo_candidates.is_empty() {
    no_logo_candidates(&mut p, input);
  }
  js_analysis(&mut p, input);
  class_patterns(&mut p, input);
  buttons(&mut p, input);
  logo::candidates(&mut p, &cx);
  background_candidates(&mut p, input);
  tasks::tasks(&mut p, &cx);
  tasks::required_fields(&mut p, input);
  p
}

fn page_context(p: &mut String, cx: &Context, title: &str) {
  if !cx.has_page_context {
    return;
  }
  p.push_str("## Page context (use to infer the site's brand)\n");
  if !cx.display_url.is_empty() {
    p.push_str(&format!(
      "- **URL** (final after redirects): {}\n",
      cx.display_url
    ));
  }
  if !title.is_empty() {
    p.push_str(&format!("- **Page title**: \"{title}\"\n"));
  }
  p.push_str("Use the full page title and URL to infer the site's brand. Many sites use \"Page Name | Brand\" or \"Brand - Page Name\" — the brand is often the **second part** (e.g. \"AI Innovation Workspace | Miro\" → brand is Miro) or the **domain** from the URL. Pick the logo that matches the **actual brand** (from title/URL), not necessarily the first phrase in the title. Our heuristic brand name below is a hint; prefer your inference from title/URL when it makes more sense.\n\n");
}

fn no_logo_candidates(p: &mut String, input: &LlmInput) {
  p.push_str("## Logo candidates: None\n");
  p.push_str("No logo candidates were extracted from this page. Do not return or attempt to select a logo. The response schema does not include logoSelection when there are no candidates.\n\n");
  let Some(chunk) = input.header_html_chunk.as_deref().filter(|x| !x.is_empty()) else {
    return;
  };
  p.push_str("## Page HTML (header/nav snippet)\n");
  p.push_str(
    "Below is a simplified snippet of the page header/nav area. Use it only for context:\n",
  );
  p.push_str("- **Brand name**: Infer from link text, aria-labels, or title attributes (e.g. `<a aria-label=\"X logo\">`, `<title>X</title>`).\n");
  p.push_str("- **Logo note**: If you see a logo-like element (e.g. `<a aria-label*=\"logo\">`, `<img>` in header, inline `<svg>`) that wasn't captured as a candidate, you may note it in reasoning—but do NOT return a logo URL or index from this HTML. Only logo candidates (none here) can be selected.\n");
  p.push_str(&format!(
    "\n```html\n{}\n```\n\n",
    sanitize(Some(chunk), 3000)
  ));
}

fn js_analysis(p: &mut String, input: &LlmInput) {
  let js_branding = input.js_branding;
  p.push_str("## JavaScript Analysis (Baseline):\n");
  p.push_str(&format!(
    "Color Scheme: {}\n",
    js_branding
      .color_scheme
      .as_deref()
      .filter(|x| !x.is_empty())
      .unwrap_or("unknown")
  ));
  if let Some(Value::Object(colors)) = js_branding
    .colors
    .as_ref()
    .and_then(|x| serde_json::to_value(x).ok())
  {
    p.push_str("Detected Colors:\n");
    for (key, value) in colors {
      if let Some(value) = value.as_str().filter(|x| !x.is_empty()) {
        p.push_str(&format!("- {key}: {value}\n"));
      }
    }
  }
  let Some(fonts) = js_branding.fonts.as_ref().filter(|x| !x.is_empty()) else {
    return;
  };
  p.push_str("\nRaw Fonts (need cleaning):\n");
  for font in fonts {
    match font.count.filter(|x| *x != 0) {
      Some(count) => p.push_str(&format!("- {} (used {count}x)\n", font.family)),
      None => p.push_str(&format!("- {}\n", font.family)),
    }
  }
  p.push_str("\n**FONT CLEANING INSTRUCTIONS:**\n");
  p.push_str("- Remove obfuscated names (e.g., \"__suisse_6d5c28\" → \"Suisse\", \"__Roboto_Mono_c8ca7d\" → \"Roboto Mono\")\n");
  p.push_str("- Skip fallback fonts (e.g., \"__suisse_Fallback_6d5c28\" → ignore)\n");
  p.push_str("- Skip CSS variables (e.g., \"var(--font-sans)\" → ignore)\n");
  p.push_str(
    "- Skip generic fonts (e.g., \"system-ui\", \"sans-serif\", \"ui-sans-serif\" → ignore)\n",
  );
  p.push_str("- Keep only real, meaningful brand fonts (max 5)\n");
  p.push_str("- Assign roles based on usage: heading, body, monospace, display\n\n");
}

fn class_patterns(p: &mut String, input: &LlmInput) {
  let mut seen = HashSet::new();
  let mut classes = Vec::new();
  for button in &input.buttons {
    for class in js::split_spaces(&button.classes) {
      if !class.is_empty() && js::len(class) < 50 && seen.insert(class) {
        classes.push(class);
      }
    }
  }
  if classes.is_empty() {
    return;
  }
  p.push_str("\n## CSS Class Patterns (for framework detection):\n");
  p.push_str(&format!(
    "Sample classes: {}\n",
    classes[..classes.len().min(50)].join(", ")
  ));
  if let Some(Value::Array(hints)) = &input.js_branding.framework_hints
    && !hints.is_empty()
  {
    let hints: Vec<String> = hints.iter().map(|h| sanitize(h.as_str(), 60)).collect();
    p.push_str(&format!(
      "Framework hints from page: {}\n",
      hints.join(", ")
    ));
  }
  p.push_str("\n**Framework Detection Patterns:**\n");
  p.push_str("- Tailwind: Look for utility classes like `flex`, `items-center`, `px-*`, `py-*`, `bg-*-500`, `rounded-*`, `text-*`, `space-x-*`, `gap-*`\n");
  p.push_str("- Bootstrap: Look for `btn`, `btn-primary`, `container`, `row`, `col-*`, `d-flex`, `justify-*`, `mb-*`, `mt-*`\n");
  p.push_str(
    "- Material UI: Look for `MuiButton`, `Mui*`, `makeStyles`, or modern Material classes\n",
  );
  p.push_str(
    "- Chakra UI: Look for `chakra-*`, minimal utility-style classes, or data attributes\n",
  );
  p.push_str("- Custom: Mixed or unique class patterns that don't match standard frameworks\n\n");
}

fn buttons(p: &mut String, input: &LlmInput) {
  if input.buttons.is_empty() {
    return;
  }
  p.push_str(&format!(
    "## Detected Buttons ({} total):\n",
    input.buttons.len()
  ));
  let mut groups: Vec<(&str, Vec<String>)> = Vec::new();
  for (i, button) in input.buttons.iter().enumerate() {
    let background = Some(button.background.as_str())
      .filter(|x| !x.is_empty())
      .unwrap_or("transparent");
    match groups.iter_mut().find(|(color, _)| *color == background) {
      Some((_, indices)) => indices.push(i.to_string()),
      None => groups.push((background, vec![i.to_string()])),
    }
  }
  p.push_str("\n**COLOR GROUPS** (buttons sharing the same background color):\n");
  for (color, indices) in &groups {
    let (vibrant, description) = color_info(color);
    p.push_str(&format!(
      "- {color} ({description}{}) → Buttons {} ({} button{})\n",
      if vibrant { " - VIBRANT" } else { "" },
      indices.join(", "),
      indices.len(),
      if indices.len() > 1 { "s" } else { "" },
    ));
  }
  p.push_str("\n⚠️ **CRITICAL**: Primary and secondary MUST be from DIFFERENT color groups!\n\n");
  p.push_str(
    "Analyze these buttons and identify which is the PRIMARY CTA and which is SECONDARY:\n\n",
  );
  for (i, button) in input.buttons.iter().enumerate() {
    let (vibrant, description) = color_info(&button.background);
    p.push_str(&format!("**Button #{i}:**\n"));
    p.push_str(&format!(
      "- Text: \"{}\"\n",
      sanitize(Some(&button.text), 80)
    ));
    p.push_str(&format!(
      "- Background Color: {} ({description}{})\n",
      button.background,
      if vibrant {
        " - VIBRANT/BRAND COLOR"
      } else {
        ""
      },
    ));
    p.push_str(&format!("- Text Color: {}\n", button.text_color));
    if let Some(border) = button.border_color.as_deref().filter(|x| !x.is_empty()) {
      p.push_str(&format!("- Border Color: {border}\n"));
    }
    if !button.border_radius.is_empty() {
      p.push_str(&format!("- Border Radius: {}\n", button.border_radius));
    }
    p.push_str(&format!(
      "- Classes: {}\n\n",
      sanitize(Some(&button.classes), 150)
    ));
  }
}

fn background_candidates(p: &mut String, input: &LlmInput) {
  let candidates = input.background_candidates;
  if candidates.is_empty() {
    return;
  }
  let screenshot = input.screenshot.is_some();
  p.push_str(&format!(
    "\n## Background Color Candidates ({}):\n",
    candidates.len()
  ));
  p.push_str(if screenshot {
    "Multiple background colors were detected. Use the screenshot to identify which is the actual page background:\n\n"
  } else {
    "Multiple background colors were detected. Identify which is the actual page background:\n\n"
  });
  for (i, candidate) in candidates.iter().enumerate() {
    let area = candidate
      .get("area")
      .and_then(Value::as_f64)
      .filter(|x| *x != 0.0 && !x.is_nan())
      .map(|x| format!(" | area: {}px²", js::number_to_string(js::round(x))))
      .unwrap_or_default();
    p.push_str(&format!(
      "#{i}: {} | source: {} | priority: {}{area}\n",
      js_string(candidate.get("color")),
      js_string(candidate.get("source")),
      js_string(candidate.get("priority")),
    ));
  }
  p.push_str("\n**Selection Rules:** ");
  if screenshot {
    p.push_str("Use the screenshot to visually identify the main page background. Consider:\n");
    p.push_str("- Color scheme (dark mode should have dark background, light mode should have light background)\n");
    p.push_str("- Most visible/largest area in the screenshot\n");
  } else {
    p.push_str("Identify the main page background based on priority and source. Consider:\n");
    p.push_str("- Color scheme (dark mode should have dark background, light mode should have light background)\n");
    p.push_str("- Highest priority sources (body/html > CSS vars > containers)\n");
    p.push_str("- Largest area coverage\n");
  }
  p.push_str("- Higher priority sources (body/html > CSS vars > containers)\n");
  p.push_str("- Return the hex color in the colorRoles.backgroundColor field\n\n");
}
