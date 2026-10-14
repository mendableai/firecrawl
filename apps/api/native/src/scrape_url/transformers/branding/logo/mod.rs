//! TS `logo-selector.ts`: pick the brand logo among the candidates by heuristics.

pub mod declared;

use std::collections::{HashMap, HashSet};

use super::js;
use super::types::LogoCandidate;

pub struct LogoSelection {
  pub selected_index: i64,
  pub confidence: f64,
  pub reasoning: String,
}

/// Everything after the last "/" before any query, unless empty.
fn filename(src: &str) -> Option<&str> {
  let without_query = src.split('?').next().unwrap_or_default();
  without_query.rsplit('/').next().filter(|x| !x.is_empty())
}

fn score_href_and_header(c: &LogoCandidate, reasons: &mut Vec<String>) -> i64 {
  let mut score = 0;
  let i = &c.indicators;
  if i.href_match && i.in_header {
    score += 50;
    reasons.push("header logo linking to homepage".into());
  } else if i.href_match {
    score += 35;
    reasons.push("links to homepage".into());
  } else if i.in_header {
    score += 25;
    reasons.push("in header".into());
  }
  if js::trim(c.href.as_deref().unwrap_or_default()).is_empty() {
    score -= 15;
    reasons.push("no link (brand logos usually link to homepage, penalty)".into());
  }
  score
}

fn is_variant(a: &LogoCandidate, b: &LogoCandidate) -> bool {
  let same_alt = !a.alt.is_empty()
    && !b.alt.is_empty()
    && js::strip_spaces(&a.alt.to_lowercase()) == js::strip_spaces(&b.alt.to_lowercase());
  let same_file = match (filename(&a.src), filename(&b.src)) {
    (Some(x), Some(y)) => a.src.contains(y) && x == y,
    _ => false,
  };
  let (p, q) = (&a.position, &b.position);
  same_alt
    || a.src == b.src
    || same_file
    || ((p.top - q.top).abs() < 20.0
      && (p.left - q.left).abs() < 50.0
      && (p.width - q.width).abs() < 30.0)
}

/// Groups of near-identical candidates (same alt, same file, same spot), in first-seen order.
fn variant_groups(candidates: &[LogoCandidate]) -> Vec<Vec<usize>> {
  let mut processed = HashSet::new();
  let mut groups = Vec::new();
  for (index, candidate) in candidates.iter().enumerate() {
    if !processed.insert(index) {
      continue;
    }
    let mut group = vec![index];
    for (other_index, other) in candidates.iter().enumerate() {
      if index == other_index || processed.contains(&other_index) {
        continue;
      }
      if is_variant(candidate, other) {
        group.push(other_index);
        processed.insert(other_index);
      }
    }
    groups.push(group);
  }
  groups
}

/// Visible, then in the header, then highest, then linking home.
fn best_variant(candidates: &[LogoCandidate], group: &[usize]) -> usize {
  group.iter().skip(1).fold(group[0], |best, &current| {
    let (b, c) = (&candidates[best], &candidates[current]);
    if c.is_visible != b.is_visible {
      return if c.is_visible { current } else { best };
    }
    if c.indicators.in_header != b.indicators.in_header {
      return if c.indicators.in_header {
        current
      } else {
        best
      };
    }
    if c.position.top < b.position.top {
      return current;
    }
    if c.position.top > b.position.top {
      return best;
    }
    if c.indicators.href_match && !b.indicators.href_match {
      current
    } else {
      best
    }
  })
}

/// Candidates whose file shows up in more than one page region.
fn repeated_logos(candidates: &[LogoCandidate]) -> HashSet<usize> {
  let mut groups: HashMap<String, Vec<usize>> = HashMap::new();
  for (index, candidate) in candidates.iter().enumerate() {
    let key = filename(&candidate.src)
      .map(str::to_lowercase)
      .filter(|x| !x.is_empty())
      .unwrap_or_else(|| candidate.src.clone());
    groups.entry(key).or_default().push(index);
  }
  groups
    .into_values()
    .filter(|indices| {
      indices.len() > 1
        && indices
          .iter()
          .map(|i| &candidates[*i].location)
          .collect::<HashSet<_>>()
          .len()
          > 1
    })
    .flatten()
    .collect()
}

fn score_brand_name(c: &LogoCandidate, brand_name: &str, reasons: &mut Vec<String>) -> i64 {
  let mut score = 0;
  let alt = js::trim(&c.alt.to_lowercase()).to_string();
  let brand = js::trim(&brand_name.to_lowercase()).to_string();
  if alt == brand {
    score += 20;
    reasons.push(format!("alt exactly matches brand name \"{brand_name}\""));
  } else if !alt.is_empty() && (alt.contains(&brand) || brand.contains(&alt)) {
    score += 12;
    reasons.push(format!("alt contains brand name \"{brand_name}\""));
  }
  if c.src.to_lowercase().contains(&brand) {
    score += 6;
    reasons.push(format!("src contains brand name \"{brand_name}\""));
  }
  score
}

fn score_size(c: &LogoCandidate, reasons: &mut Vec<String>) -> i64 {
  let mut score = 0;
  let area = c.position.area();
  if area > 1000.0 && area < 50000.0 {
    score += 5;
    reasons.push("reasonable size".into());
  } else if area < 500.0 {
    score -= 8;
    reasons.push("too small (likely icon, penalty)".into());
  } else if (50000.0..=200000.0).contains(&area) {
    score -= 10;
    reasons.push("too large (likely banner/og:image, penalty)".into());
  } else if area > 200000.0 {
    score -= 20;
    reasons.push("extremely large (likely og:image, heavy penalty)".into());
  }
  let (width, height) = (c.position.width, c.position.height);
  if (width - height).abs() < 5.0 && (width < 40.0 || height < 40.0) {
    score -= 12;
    reasons.push("small square icon (likely UI icon, heavy penalty)".into());
  }
  score
}

fn score_candidate(
  candidates: &[LogoCandidate],
  index: usize,
  bonus: i64,
  brand_name: Option<&str>,
) -> (i64, String) {
  let c = &candidates[index];
  let mut reasons = Vec::new();
  let mut score = 0;
  if bonus > 0 {
    score += bonus;
    reasons.push(format!("variant bonus (+{bonus})"));
  }
  score += score_href_and_header(c, &mut reasons);
  let mut add = |condition: bool, points: i64, reason: &str| {
    if condition {
      score += points;
      reasons.push(reason.to_string());
    }
  };
  add(c.location == "header", 20, "header location");
  add(c.is_visible, 15, "visible");
  add(
    !c.is_visible,
    -25,
    "invisible (hidden/minimized variant, heavy penalty)",
  );
  add(
    c.position.top < 100.0 && c.position.left < 300.0,
    10,
    "top-left position",
  );
  let is_highest = candidates
    .iter()
    .enumerate()
    .all(|(i, other)| i == index || c.position.top <= other.position.top);
  add(
    is_highest && c.position.top < 200.0,
    12,
    "highest logo on page",
  );
  add(c.indicators.alt_match, 8, "alt matches logo/brand");
  add(c.indicators.src_match, 5, "src contains logo");
  add(c.indicators.class_match, 5, "class contains logo");
  if let Some(brand_name) = brand_name.filter(|x| !x.is_empty()) {
    score += score_brand_name(c, brand_name, &mut reasons);
  }
  score += score_size(c, &mut reasons);
  let mut add = |condition: bool, points: i64, reason: &str| {
    if condition {
      score += points;
      reasons.push(reason.to_string());
    }
  };
  add(c.is_svg, 3, "SVG format");
  add(c.location == "footer", -15, "footer location (penalty)");
  add(
    c.location == "body" && !c.indicators.in_header,
    -10,
    "body location without header (penalty)",
  );
  (score, reasons.join(", "))
}

/// TS `selectLogoWithConfidence`: the best-scoring candidate, with a
/// confidence from how far it leads the runner-up.
pub fn select_logo_with_confidence(
  candidates: &[LogoCandidate],
  brand_name: Option<&str>,
) -> LogoSelection {
  let none = |reasoning: &str| LogoSelection {
    selected_index: -1,
    confidence: 0.0,
    reasoning: reasoning.to_string(),
  };
  if candidates.is_empty() {
    return none("No logo candidates provided");
  }

  let repeated = repeated_logos(candidates);
  let mut bonuses: HashMap<usize, i64> = HashMap::new();
  for group in variant_groups(candidates) {
    let best = best_variant(candidates, &group);
    let mut bonus = 0;
    if group.iter().any(|i| repeated.contains(i)) {
      bonus = 15;
    }
    if group.len() > 1 {
      bonus += 8;
    }
    bonuses.insert(best, bonus);
  }

  let mut scored: Vec<(usize, i64, String)> = (0..candidates.len())
    .filter_map(|index| {
      let bonus = *bonuses.get(&index)?;
      let (score, reasons) = score_candidate(candidates, index, bonus, brand_name);
      Some((index, score, reasons))
    })
    .collect();
  scored.sort_by_key(|(_, score, _)| std::cmp::Reverse(*score));

  let Some((index, score, reasons)) = scored.first() else {
    return none("All candidates were filtered out as duplicate variants");
  };
  let second = scored.get(1).map(|x| x.1);
  let separation = second.map_or(*score, |second| score - second);
  let (confidence, reasoning) = if *score >= 60 && separation >= 20 {
    (
      0.9,
      format!("Strong indicators: {reasons}. Score: {score} (clear winner by {separation} points)"),
    )
  } else if *score >= 45 && separation >= 15 {
    (
      0.75,
      format!("Good indicators: {reasons}. Score: {score} (ahead by {separation} points)"),
    )
  } else if *score >= 30 {
    (
      0.6,
      format!("Moderate indicators: {reasons}. Score: {score}. May benefit from LLM validation."),
    )
  } else {
    (
      0.4,
      format!(
        "Weak indicators: {reasons}. Score: {score}. LLM validation recommended (close scores: top={score}, second={})",
        second.unwrap_or(0)
      ),
    )
  };
  LogoSelection {
    selected_index: *index as i64,
    confidence,
    reasoning,
  }
}

/// TS `getTopCandidatesForLLM`: the indices of the candidates the model sees,
/// best first, or all of them in order when there are at most `max`.
pub fn top_candidates_for_llm(candidates: &[LogoCandidate], max: usize) -> Vec<usize> {
  if candidates.len() <= max {
    return (0..candidates.len()).collect();
  }
  let mut scored: Vec<(usize, i64)> = candidates
    .iter()
    .enumerate()
    .map(|(i, c)| {
      let mut score = score_href_and_header(c, &mut Vec::new());
      score += [
        (c.location == "header", 20),
        (c.is_visible, 15),
        (c.indicators.class_match, 10),
        (c.indicators.src_match, 10),
        (c.indicators.alt_match, 5),
        (c.source == "document.images", 15),
      ]
      .iter()
      .filter(|(hit, _)| *hit)
      .map(|(_, points)| points)
      .sum::<i64>();
      (i, score)
    })
    .collect();
  scored.sort_by_key(|(_, score)| std::cmp::Reverse(*score));
  scored.into_iter().take(max).map(|(i, _)| i).collect()
}
