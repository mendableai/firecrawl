use firecrawl_rs::{
  _extract_attributes, _extract_images, _extract_links, _extract_metadata, _transform_html_inner,
  AttributeSelector, ExtractAttributesOptions, TransformHtmlOptions,
};
use hegel::generators as gs;
use hegel::{Generator, TestCase, one_of};

#[hegel::composite]
fn html_attr(tc: &TestCase) -> String {
  let name = tc.draw(one_of!(
    gs::sampled_from(vec![
      "href".to_string(),
      "src".to_string(),
      "data-src".to_string(),
      "srcset".to_string(),
      "data-srcset".to_string(),
      "name".to_string(),
      "property".to_string(),
      "itemprop".to_string(),
      "content".to_string(),
      "rel".to_string(),
      "lang".to_string(),
      "poster".to_string(),
      "style".to_string(),
      "id".to_string(),
      "class".to_string(),
      "data-value".to_string(),
    ]),
    gs::from_regex(r"[a-zA-Z_:][a-zA-Z0-9_.:-]{0,12}")
  ));
  let val = tc.draw(one_of!(
    gs::sampled_from(vec![
      "https://example.com/page".to_string(),
      "http:/example.com/single-slash".to_string(),
      "https:/example.com/single-slash".to_string(),
      "//cdn.example.com/img.png".to_string(),
      "/relative/path.jpg".to_string(),
      "data:image/png;base64,iVBORw0KGgo=".to_string(),
      "blob:https://example.com/550e8400".to_string(),
      "javascript:void(0)".to_string(),
      "a.jpg 1x, b.jpg 2x, c.jpg NaNx".to_string(),
      "a.jpg 100w, b.jpg 200w, c.jpg infw".to_string(),
      "og:title".to_string(),
      "og:locale:alternate".to_string(),
      "description".to_string(),
      "title".to_string(),
      "icon".to_string(),
      "apple-touch-icon".to_string(),
      "background: url('/bg.png')".to_string(),
      "background-image: url(\"https://example.com/a.webp\")".to_string(),
    ]),
    gs::vecs(gs::sampled_from(vec![
      "a.jpg 1x".to_string(),
      "b.jpg 2x".to_string(),
      "c.jpg 3x".to_string(),
      "d.jpg NaNx".to_string(),
      "e.jpg 100w".to_string(),
      "f.jpg 200w".to_string(),
      "g.jpg NaNw".to_string(),
      "h.jpg infx".to_string(),
    ]))
    .min_size(1)
    .max_size(25)
    .map(|parts| parts.join(", ")),
    gs::text().max_size(40)
  ));
  let quote = if tc.draw(gs::booleans()) { '"' } else { '\'' };
  format!("{name}={quote}{val}{quote}")
}

#[hegel::composite]
fn html_fragment(tc: &TestCase) -> String {
  let tag = tc.draw(one_of!(
    gs::sampled_from(vec![
      "html".to_string(),
      "head".to_string(),
      "body".to_string(),
      "title".to_string(),
      "base".to_string(),
      "meta".to_string(),
      "link".to_string(),
      "div".to_string(),
      "p".to_string(),
      "span".to_string(),
      "a".to_string(),
      "img".to_string(),
      "picture".to_string(),
      "source".to_string(),
      "video".to_string(),
      "header".to_string(),
      "footer".to_string(),
      "nav".to_string(),
      "aside".to_string(),
      "script".to_string(),
      "style".to_string(),
      "noscript".to_string(),
      "template".to_string(),
    ]),
    gs::from_regex(r"[a-z]{1,8}")
  ));
  let attrs = tc.draw(gs::vecs(html_attr()).max_size(4));
  let body = tc.draw(gs::text().max_size(40));
  let attr_str = if attrs.is_empty() {
    String::new()
  } else {
    format!(" {}", attrs.join(" "))
  };
  if tc.draw(gs::booleans()) {
    format!("<{tag}{attr_str}>{body}</{tag}>")
  } else {
    format!("<{tag}{attr_str}>")
  }
}

#[hegel::composite]
fn generated_html(tc: &TestCase) -> String {
  let mode = tc.draw(gs::integers::<u8>().min_value(0).max_value(3));
  match mode {
    0 => {
      let fragments = tc.draw(gs::vecs(html_fragment()).max_size(12));
      fragments.join("")
    }
    1 => {
      let raw = tc.draw(gs::binary().max_size(256));
      String::from_utf8_lossy(&raw).into_owned()
    }
    2 => {
      let srcset_entries = tc.draw(
        gs::vecs(gs::sampled_from(vec![
          "a.jpg 1x".to_string(),
          "b.jpg 2x".to_string(),
          "c.jpg 3x".to_string(),
          "d.jpg NaNx".to_string(),
        ]))
        .min_size(25)
        .max_size(45),
      );
      format!("<img srcset=\"{}\">", srcset_entries.join(", "))
    }
    _ => {
      let outer = tc.draw(gs::vecs(html_fragment()).max_size(6)).join("");
      let inner = tc.draw(gs::vecs(html_fragment()).max_size(6)).join("");
      format!("<!DOCTYPE html><html><head>{outer}</head><body><div>{inner}</div></body></html>")
    }
  }
}

#[hegel::composite]
fn css_selector(tc: &TestCase) -> String {
  tc.draw(one_of!(
    gs::sampled_from(vec![
      "div".to_string(),
      "a[href]".to_string(),
      "img".to_string(),
      ".header".to_string(),
      "#main".to_string(),
      "meta[name]".to_string(),
      "*".to_string(),
      "[data-value]".to_string(),
    ]),
    gs::text().max_size(24)
  ))
}

#[hegel::test]
fn transform_html_never_panics(tc: TestCase) {
  let html = tc.draw(generated_html());
  let url = tc.draw(one_of!(
    gs::urls(),
    gs::sampled_from(vec![
      "https://example.com/dir/index.html".to_string(),
      "http://localhost:8080".to_string(),
      "not-a-valid-url".to_string(),
    ]),
    gs::text().max_size(32)
  ));
  let include_tags = tc.draw(one_of!(
    gs::just(Vec::new()),
    gs::vecs(css_selector()).max_size(4)
  ));
  let exclude_tags = tc.draw(one_of!(
    gs::just(Vec::new()),
    gs::vecs(css_selector()).max_size(4)
  ));
  let only_main_content = tc.draw(gs::booleans());
  let omce_signatures = tc.draw(gs::optional(gs::vecs(gs::text().max_size(32)).max_size(4)));

  let _ = _transform_html_inner(TransformHtmlOptions {
    html,
    url,
    include_tags,
    exclude_tags,
    only_main_content,
    omce_signatures,
  });
}

#[hegel::test]
fn extract_links_never_panics(tc: TestCase) {
  let html = tc.draw(generated_html());
  let _ = _extract_links(&html);
}

#[hegel::test]
fn extract_images_never_panics(tc: TestCase) {
  let html = tc.draw(generated_html());
  let base_url = tc.draw(one_of!(
    gs::urls(),
    gs::just("https://example.com/path/page.html".to_string()),
    gs::text().max_size(32)
  ));
  let _ = _extract_images(&html, &base_url);
}

#[hegel::test]
fn extract_metadata_never_panics(tc: TestCase) {
  let html = tc.draw(generated_html());
  let _ = _extract_metadata(&html);
}

#[hegel::test]
fn extract_attributes_never_panics(tc: TestCase) {
  let html = tc.draw(generated_html());
  let selector_pairs = tc.draw(gs::vecs(gs::tuples!(css_selector(), gs::text().max_size(24))).max_size(6));
  let selectors = selector_pairs
    .into_iter()
    .map(|(selector, attribute)| AttributeSelector {
      selector,
      attribute,
    })
    .collect();
  let _ = _extract_attributes(&html, &ExtractAttributesOptions { selectors });
}
