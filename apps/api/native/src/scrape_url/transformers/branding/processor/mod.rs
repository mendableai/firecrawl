//! TS `processRawBranding`: the profile the page's own styles give, before any model.

mod buttons;
mod inputs;
mod palette;

use serde_json::Value;

use super::js;
use super::profile::{
  BrandingComponents, BrandingFont, BrandingFontFamilies, BrandingImages, BrandingProfile,
  BrandingSpacing, BrandingTypography, InputStyle,
};
use super::types::{BrandingScriptReturn, Corners, ScriptImage};

/// `${n}px` per corner, with "0px" for corners the script couldn't read.
fn corners(radius: Option<&Corners<Option<f64>>>) -> Corners<String> {
  let px = |x: Option<f64>| {
    x.map_or_else(
      || "0px".to_string(),
      |x| format!("{}px", js::number_to_string(x)),
    )
  };
  let r = radius.cloned().unwrap_or_default();
  Corners {
    top_left: px(r.top_left),
    top_right: px(r.top_right),
    bottom_right: px(r.bottom_right),
    bottom_left: px(r.bottom_left),
  }
}

/// The largest corner radius, as TS `calculateRepresentativeBorderRadius`.
fn representative_radius(radius: Option<&Corners<Option<f64>>>) -> String {
  let Some(r) = radius else {
    return "0px".to_string();
  };
  let value = |x: Option<f64>| x.filter(|x| *x != 0.0 && !x.is_nan()).unwrap_or(0.0);
  let max = [r.top_left, r.top_right, r.bottom_right, r.bottom_left]
    .into_iter()
    .map(value)
    .fold(f64::NEG_INFINITY, js::max);
  if max > 0.0 {
    format!("{}px", js::number_to_string(max))
  } else {
    "0px".to_string()
  }
}

fn infer_base_unit(values: &[Option<f64>]) -> u32 {
  let mut vs: Vec<i64> = values
    .iter()
    .flatten()
    .filter(|v| v.is_finite() && **v > 0.0 && **v <= 128.0)
    .map(|v| js::round(*v) as i64)
    .collect();
  if vs.is_empty() {
    return 8;
  }
  for c in [4, 6, 8, 10, 12] {
    let ok = vs
      .iter()
      .filter(|v| *v % c == 0 || ((*v % c) - c).abs() <= 1 || *v % c <= 1)
      .count();
    if ok as f64 / vs.len() as f64 >= 0.6 {
      return c as u32;
    }
  }
  vs.sort_unstable();
  let med = vs[vs.len() / 2] as f64;
  js::max(2.0, js::min(12.0, js::round(med / 2.0) * 2.0)) as u32
}

fn pick_border_radius(radii: impl Iterator<Item = Option<f64>>) -> String {
  let mut rs: Vec<f64> = radii.flatten().filter(|x| x.is_finite()).collect();
  if rs.is_empty() {
    return "8px".to_string();
  }
  rs.sort_by(f64::total_cmp);
  format!("{}px", js::number_to_string(js::round(rs[rs.len() / 2])))
}

/// `key` is a JS array index, which plain objects list first in numeric order.
fn array_index(key: &str) -> Option<u32> {
  let index: u32 = key.parse().ok()?;
  (index != u32::MAX && index.to_string() == key).then_some(index)
}

/// The ten most used font families, counted like TS's plain-object tally.
fn infer_fonts<'a>(fonts: impl Iterator<Item = &'a str>) -> Vec<BrandingFont> {
  let mut freq: Vec<(&str, u32)> = Vec::new();
  for font in fonts.filter(|x| !x.is_empty()) {
    match freq.iter_mut().find(|(f, _)| *f == font) {
      Some((_, count)) => *count += 1,
      None => freq.push((font, 1)),
    }
  }
  freq.sort_by_key(|(f, _)| array_index(f).map_or((1, 0), |i| (0, i)));
  freq.sort_by_key(|(_, count)| std::cmp::Reverse(*count));
  freq
    .into_iter()
    .take(10)
    .map(|(family, count)| BrandingFont {
      family: family.to_string(),
      count: Some(count),
      role: None,
    })
    .collect()
}

fn image_src(images: &[ScriptImage], kind: &str) -> Option<String> {
  images
    .iter()
    .find(|i| i.r#type == kind)
    .and_then(|i| i.src.clone())
    .filter(|x| !x.is_empty())
}

fn typography(raw: &BrandingScriptReturn) -> BrandingTypography {
  let stacks = &raw.typography.stacks;
  let first = |stack: &[String]| stack.first().filter(|x| !x.is_empty()).cloned();
  let system = || "system-ui, sans-serif".to_string();
  BrandingTypography {
    font_families: BrandingFontFamilies {
      primary: first(&stacks.body).unwrap_or_else(system),
      heading: first(&stacks.heading)
        .or_else(|| first(&stacks.body))
        .unwrap_or_else(system),
    },
    font_stacks: stacks.clone(),
    font_sizes: raw.typography.sizes.clone(),
  }
}

pub fn process_raw_branding(
  raw: &BrandingScriptReturn,
  framework_hints: Option<Value>,
  logo_candidates: Option<Value>,
) -> BrandingProfile {
  let page_background = raw.page_background.as_deref();
  let color_scheme = raw.color_scheme.as_deref();
  let stacks = &raw.typography.stacks;
  let fonts = stacks
    .body
    .iter()
    .chain(&stacks.heading)
    .chain(&stacks.paragraph)
    .map(String::as_str)
    .chain(
      raw
        .snapshots
        .iter()
        .flat_map(|s| s.typography.font_stack.iter().flatten().map(String::as_str)),
    );

  let buttons = buttons::button_snapshots(&raw.snapshots, page_background);
  let inputs = inputs::input_snapshots(&raw.snapshots, page_background);
  let input = inputs.first().map(|x| InputStyle {
    background: x.background.clone(),
    text_color: x.text_color.clone(),
    border_color: x.border_color.clone(),
    border_radius: x.border_radius.clone(),
    border_radius_corners: x.border_radius_corners.clone(),
    shadow: x.shadow.clone(),
  });

  BrandingProfile {
    color_scheme: raw.color_scheme.clone(),
    fonts: Some(infer_fonts(fonts)),
    colors: Some(palette::infer_palette(
      &raw.snapshots,
      &raw.css_data.colors,
      color_scheme,
      page_background,
    )),
    typography: Some(typography(raw)),
    spacing: Some(BrandingSpacing {
      base_unit: infer_base_unit(&raw.css_data.spacings),
      border_radius: pick_border_radius(
        raw
          .snapshots
          .iter()
          .map(|s| s.radius)
          .chain(raw.css_data.radii.iter().copied()),
      ),
    }),
    components: Some(BrandingComponents {
      input,
      ..Default::default()
    }),
    images: Some(BrandingImages {
      logo: Some(image_src(&raw.images, "logo").or_else(|| image_src(&raw.images, "logo-svg"))),
      favicon: image_src(&raw.images, "favicon"),
      og_image: image_src(&raw.images, "og").or_else(|| image_src(&raw.images, "twitter")),
      ..Default::default()
    }),
    button_snapshots: Some(buttons),
    input_snapshots: Some(inputs),
    framework_hints,
    logo_candidates,
    ..Default::default()
  }
}
