//! The logo candidates part of TS `buildBrandingPrompt`.

use url::Url;

use super::super::super::js;
use super::super::super::types::LogoCandidate;
use super::{Context, sanitize};

/// `s.length > max ? s.substring(0, max) + "..." : s`.
fn preview(s: &str, max: usize) -> String {
  if js::len(s) > max {
    format!("{}...", js::slice_utf16(s, 0, max))
  } else {
    s.to_string()
  }
}

fn host(url: &Url) -> String {
  url.host_str().unwrap_or_default().to_lowercase()
}

/// TS `classifyHref`: where a candidate's link goes, relative to the page.
fn classify_href(candidate: &LogoCandidate, display_url: &str) -> &'static str {
  let Some(href) = candidate
    .href
    .as_deref()
    .filter(|x| !js::trim(x).is_empty())
  else {
    return "none";
  };
  if candidate.indicators.href_match {
    return "home";
  }
  let Some((base, resolved)) = Url::parse(display_url)
    .ok()
    .and_then(|base| Some((host(&base), base.join(href).ok()?)))
  else {
    return "unknown";
  };
  if resolved.host_str().is_none_or(str::is_empty) || base.is_empty() {
    return "internal";
  }
  if host(&resolved) == base {
    "internal"
  } else {
    "external"
  }
}

/// TS `getLogoCandidateMeta`, rendered as the candidate's `Size:` line.
fn size_line(candidate: &LogoCandidate, cx: &Context) -> String {
  let rounded = |x: f64| js::max(0.0, js::round(x));
  let position = &candidate.position;
  let (width, height) = (rounded(position.width), rounded(position.height));
  let area = js::max(0.0, js::round(width * height));
  let aspect = if width != 0.0 && height != 0.0 {
    js::max(width / height, height / width)
  } else {
    0.0
  };
  let max_side = js::max(width, height);
  let size = match () {
    _ if max_side <= 24.0 || area <= 400.0 => "tiny",
    _ if max_side <= 48.0 || area <= 1800.0 => "small",
    _ if max_side <= 140.0 || area <= 12000.0 => "medium",
    _ if max_side <= 320.0 || area <= 50000.0 => "large",
    _ => "hero",
  };
  let href_type = classify_href(candidate, cx.display_url);

  let src = candidate.src.to_ascii_lowercase();
  let filename = src
    .split('?')
    .next()
    .and_then(|x| x.split('#').next())
    .and_then(|x| x.rsplit('/').next())
    .unwrap_or_default();
  let has_logo = |s: &str| s.contains("logo") || s.contains("brand");
  let brand = js::strip_spaces(&cx.brand.to_lowercase());
  let mut hints = Vec::new();
  if has_logo(filename) || has_logo(&src) {
    hints.push("filename=logo".to_string());
  }
  match size {
    "tiny" | "small" => hints.push("icon-sized".to_string()),
    "hero" => hints.push("hero-sized".to_string()),
    _ => {}
  }
  if aspect >= 3.0 && width >= 80.0 {
    hints.push("wordmark-shaped".to_string());
  }
  if href_type == "external" {
    hints.push("external-link".to_string());
  }
  if !brand.is_empty() && js::strip_spaces(&candidate.alt.to_lowercase()).contains(&brand) {
    hints.push("alt~=brand".to_string());
  }
  if let Some(score) = candidate.logo_svg_score.filter(|_| candidate.is_svg) {
    hints.push(format!(
      "svgScore:{}",
      js::number_to_string(js::round(score))
    ));
  }

  let href_url = candidate
    .href
    .as_deref()
    .filter(|x| !x.is_empty())
    .map(|x| format!(" | hrefUrl:{}", preview(x, 60)))
    .unwrap_or_default();
  format!(
    "  Size: {}x{} ({size}, area:{}, aspect:{}) | href:{href_type}{href_url} | hints:[{}]\n",
    js::number_to_string(width),
    js::number_to_string(height),
    js::number_to_string(area),
    if aspect != 0.0 {
      js::to_fixed(aspect, 1)
    } else {
      "n/a".to_string()
    },
    if hints.is_empty() {
      "none".to_string()
    } else {
      hints.join(", ")
    },
  )
}

fn metadata_line(candidate: &LogoCandidate) -> String {
  let i = &candidate.indicators;
  let position = &candidate.position;
  let round = |x: f64| js::number_to_string(js::round(x));
  let svg_score = candidate
    .logo_svg_score
    .map(|x| format!(" | logoSvgScore:{}", round(x)))
    .unwrap_or_default();
  format!(
    "  Metadata: alt:\"{}\" | ariaLabel:\"{}\" | title:\"{}\" | source:{} | location:{} | isVisible:{} | position:top:{} left:{} width:{} height:{} | indicators:{{\"inHeader\":{},\"altMatch\":{},\"srcMatch\":{},\"classMatch\":{},\"hrefMatch\":{}}}{svg_score}\n",
    sanitize(Some(&candidate.alt), 100),
    sanitize(candidate.aria_label.as_deref(), 100),
    sanitize(candidate.title.as_deref(), 100),
    candidate.source,
    candidate.location,
    candidate.is_visible,
    round(position.top),
    round(position.left),
    round(position.width),
    round(position.height),
    i.in_header,
    i.alt_match,
    i.src_match,
    i.class_match,
    i.href_match,
  )
}

fn guidance(p: &mut String, cx: &Context) {
  let input = cx.input;
  let candidates = &input.logo_candidates;
  if let Some(pick) = input
    .heuristic_pick
    .as_ref()
    .filter(|x| x.index < candidates.len())
  {
    p.push_str(&format!(
      "**Heuristic suggestion**: Our heuristic selected **Candidate #{}** (confidence: {}%). Reason: {}\n\n",
      pick.index,
      js::to_fixed(pick.confidence * 100.0, 0),
      pick.reasoning,
    ));
    p.push_str("**Your task**: Confirm this choice OR pick a different index. If you pick a different logo, you MUST explain why the heuristic was wrong and why your choice is better.\n\n");
  }
  if input.screenshot.is_some() {
    p.push_str("**IMPORTANT**: Look at the screenshot provided. The brand logo is almost always in the TOP/HEADER area of the page.\n");
    p.push_str("Find the logo in the header area of the screenshot, then match it to one of the candidates below.\n\n");
  } else {
    p.push_str(
      "**IMPORTANT**: The brand logo is almost always in the TOP/HEADER area of the page.\n",
    );
    p.push_str("Find the logo in the header area (usually the top of the page), then match it to one of the candidates below.\n\n");
  }
  if let Some(favicon) = input.favicon.filter(|x| !x.is_empty()) {
    p.push_str(&format!(
      "**Favicon**: The site's favicon is: {}\n",
      sanitize(Some(favicon), 100)
    ));
    p.push_str("The main logo is often the favicon image or favicon + wordmark. Prefer a candidate whose src matches or resembles the favicon (same domain/filename, or \"Logo.svg\"/wordmark in header with href=home). Do NOT pick a random header SVG that does not link to home and does not match the favicon/brand.\n\n");
  }
  if cx.has_page_context {
    p.push_str("**Brand**: Infer from page title/URL above (e.g. \"X | Miro\" → brand Miro). The logo should match that brand.\n");
  }
  if !cx.brand.is_empty() {
    p.push_str(&format!(
      "Heuristic brand hint: \"{}\" (from page meta/title — use only if it aligns with your inference from title/URL).\n\n",
      cx.brand
    ));
  } else if cx.has_page_context {
    p.push('\n');
  }
}

/// The `## Logo Candidates` section, absent when there are none.
pub fn candidates(p: &mut String, cx: &Context) {
  let candidates = &cx.input.logo_candidates;
  if candidates.is_empty() {
    return;
  }
  p.push_str(&format!("\n## Logo Candidates ({}):\n", candidates.len()));
  guidance(p, cx);
  for (i, candidate) in candidates.iter().enumerate() {
    p.push_str(&format!("\n**Logo Candidate #{i}**\n"));
    p.push_str(&metadata_line(candidate));
    p.push_str(&size_line(candidate, cx));
    p.push_str(&format!("  Source URL: {}\n", preview(&candidate.src, 80)));
  }
  rules(p, cx);
}

fn rules(p: &mut String, cx: &Context) {
  let screenshot = cx.input.screenshot.is_some();
  p.push_str("\n**Candidate Hints (how to use them):**\n");
  p.push_str("- alt, ariaLabel, title = text from the image/link (often the brand or \"X logo\"); use these to match the brand name\n");
  p.push_str(
    "- size labels: tiny/small are usually UI icons; hero-sized are usually hero images/banners\n",
  );
  p.push_str("- wordmark-shaped is OK if it is in header and links to homepage\n");
  p.push_str("- **href=home (or \"/\" or \"#\") in header is a strong brand signal** — the main logo almost always links to home; avoid picking header candidates that link to product/docs/other pages unless they clearly match the favicon or \"Logo\" in src\n");
  p.push_str("- href:external is usually NOT the brand logo\n");
  p.push_str("- source: document.images = main page images (often the primary brand logo)\n");
  p.push_str("- If a favicon was provided above, prefer candidates whose src matches or resembles it (same domain, or Logo.svg/wordmark)\n");
  p.push_str("- logoSvgScore/svgScore: higher = more logo-like (SVG or image)\n\n");

  p.push_str("\n**LOGO SELECTION - CRITICAL RULES (follow in order):**\n");
  p.push_str("1. **NEVER pick invisible or tiny UI icons:** If a candidate has isVisible:false, do NOT pick it unless it is the ONLY header candidate. Prefer isVisible:true.\n");
  p.push_str("2. **Prefer href=home in header:** The main brand logo almost always links to home (\"/\", \"#\", or homepage URL). Do NOT pick a header candidate that links to a product/docs/other page if another candidate has href=home or matches the favicon/Logo.svg.\n");
  p.push_str("3. **NEVER pick \"tiny\" or \"small\" when a proper logo exists:** If any candidate has size \"medium\" or \"large\" and is in header with href=home (or matches favicon), do NOT pick a \"tiny\" or \"small\" candidate (those are usually menu/hamburger/icons).\n");
  p.push_str("4. **REJECT by alt text:** Do NOT pick candidates whose alt/ariaLabel contains: \"menu\", \"hamburger\", \"toggle\", \"mobile menu\", \"menu open\", \"menu close\", \"close-mobile\". Those are UI icons, not the brand logo.\n");
  p.push_str("5. **Prefer the main visible logo:** When multiple candidates share the same href (e.g. homepage), pick the one with LARGER width×height and isVisible:true — that is the primary logo; the smaller/hidden one is often a collapsed-nav variant.\n");
  p.push_str("6. **Prefer favicon match or clear Logo:** If favicon was provided, prefer a candidate whose src matches or resembles it, or a clear \"Logo.svg\"/wordmark in header with href=home. Prefer alt matching brand (e.g. \"X Home\") over generic or empty alt.\n\n");
  p.push_str("**LOGO SELECTION - SIMPLE APPROACH:**\n");
  p.push_str(if screenshot {
    "Look at the screenshot and select the MOST PROMINENT primary brand logo (the one users actually see in the header).\n\n"
  } else {
    "Select the MOST PROMINENT primary brand logo (largest visible header logo that represents the brand).\n\n"
  });
  p.push_str("**Simple Rules:**\n");
  p.push_str("1. **Look at the TOP of the page** - The main logo is almost always in the header/navbar at the very top\n");
  p.push_str(&format!(
    "2. **Primary logo** - Choose the largest, most visible logo that represents \"{}\" (prefer medium/large size, isVisible:true)\n",
    if cx.brand.is_empty() { "the website's brand" } else { &cx.brand }
  ));
  p.push_str("3. **Prefer header logos** - Logos in the header/navbar area are the brand logo (highest priority)\n");
  p.push_str("4. **Ignore partner/client logos** - Skip smaller logos in \"customers\", \"partners\", or footer sections\n");
  p.push_str(if screenshot {
    "5. **Use the screenshot** - Visually identify which logo is THE main brand logo users see first (not a tiny icon or hidden variant)\n\n"
  } else {
    "5. **Use position + size + isVisible** - Prefer header, larger dimensions, and isVisible:true; reject tiny or invisible candidates\n\n"
  });
  p.push_str("**What to avoid:**\n");
  p.push_str("- Tiny or small icons (menu, hamburger, close, toggle) — check alt text and size\n");
  p.push_str("- Candidates with isVisible:false when a visible header logo exists\n");
  p.push_str("- Customer/client logos (usually smaller, in groups, different brand names)\n");
  p.push_str("- Social media icons\n");
  p.push_str("- Footer logos (unless no header logo exists)\n\n");
  p.push_str("Just pick the obvious main brand logo at the top of the page that users see first (visible, medium/large, alt like brand name or \"X Home\").\n\n");
}
