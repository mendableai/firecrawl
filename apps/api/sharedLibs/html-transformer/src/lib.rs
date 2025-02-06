use std::{collections::HashMap, ffi::{CStr, CString}};

use kuchikiki::{parse_html, traits::TendrilSink};
use serde::Deserialize;
use serde_json::Value;
use url::Url;

/// Extracts links from HTML
/// 
/// # Safety
/// Input options must be a C HTML string. Output will be a JSON string array. Output string must be freed with free_string.
#[no_mangle]
pub unsafe extern "C" fn extract_links(html: *const libc::c_char) -> *mut libc::c_char {
    let html = unsafe { CStr::from_ptr(html) }.to_str().unwrap();

    let document = parse_html().one(html);

    let mut out: Vec<String> = Vec::new();

    let anchors: Vec<_> = document.select("a[href]").unwrap().collect();
    for anchor in anchors {
        let mut href = anchor.attributes.borrow().get("href").unwrap().to_string();
        
        if href.starts_with("http:/") && !href.starts_with("http://") {
            href = format!("http://{}", &href[6..]);
        } else if href.starts_with("https:/") && !href.starts_with("https://") {
            href = format!("https://{}", &href[7..]);
        }

        out.push(href);
    }

    CString::new(serde_json::ser::to_string(&out).unwrap()).unwrap().into_raw()
}

macro_rules! insert_meta_name {
    ($out:ident, $document:ident, $metaName:expr, $outName:expr) => {
        if let Some(x) = $document.select(&format!("meta[name=\"{}\"]", $metaName)).unwrap().next().and_then(|description| description.attributes.borrow().get("content").map(|x| x.to_string())) {
            $out.insert(($outName).to_string(), Value::String(x));
        }
    };
}

macro_rules! insert_meta_property {
    ($out:ident, $document:ident, $metaName:expr, $outName:expr) => {
        if let Some(x) = $document.select(&format!("meta[property=\"{}\"]", $metaName)).unwrap().next().and_then(|description| description.attributes.borrow().get("content").map(|x| x.to_string())) {
            $out.insert(($outName).to_string(), Value::String(x));
        }
    };
}

/// Extracts metadata from HTML
/// 
/// # Safety
/// Input options must be a C HTML string. Output will be a JSON object. Output string must be freed with free_string.
#[no_mangle]
pub unsafe extern "C" fn extract_metadata(html: *const libc::c_char) -> *mut libc::c_char {
    let html = unsafe { CStr::from_ptr(html) }.to_str().unwrap();

    let document = parse_html().one(html);
    let mut out = HashMap::<String, Value>::new();

    if let Some(title) = document.select("title").unwrap().next() {
        out.insert("title".to_string(), Value::String(title.text_contents()));
    }
    // insert_meta_name!(out, document, "description", "description");

    if let Some(favicon_link) = document.select("link[rel=\"icon\"]").unwrap().next()
        .and_then(|x| x.attributes.borrow().get("href").map(|x| x.to_string()))
        .or_else(|| document.select("link[rel*=\"icon\"]").unwrap().next()
            .and_then(|x| x.attributes.borrow().get("href").map(|x| x.to_string()))) {
        out.insert("favicon".to_string(), Value::String(favicon_link));
    }

    if let Some(lang) = document.select("html[lang]").unwrap().next().and_then(|x| x.attributes.borrow().get("lang").map(|x| x.to_string())) {
        out.insert("language".to_string(), Value::String(lang));
    }

    // insert_meta_name!(out, document, "keywords", "keywords");
    // insert_meta_name!(out, document, "robots", "robots");
    insert_meta_property!(out, document, "og:title", "ogTitle");
    insert_meta_property!(out, document, "og:description", "ogDescription");
    insert_meta_property!(out, document, "og:url", "ogUrl");
    insert_meta_property!(out, document, "og:image", "ogImage");
    insert_meta_property!(out, document, "og:audio", "ogAudio");
    insert_meta_property!(out, document, "og:determiner", "ogDeterminer");
    insert_meta_property!(out, document, "og:locale", "ogLocale");

    for meta in document.select("meta[property=\"og:locale:alternate\"]").unwrap() {
        let attrs = meta.attributes.borrow();

        if let Some(content) = attrs.get("content") {
            if let Some(v) = out.get_mut("og:locale:alternate") {
                match v {
                    Value::Array(x) => {
                        x.push(Value::String(content.to_string()));
                    },
                    _ => unreachable!(),
                }
            } else {
                out.insert("og:locale:alternate".to_string(), Value::Array(vec! [Value::String(content.to_string())]));
            }
        }
    }

    insert_meta_property!(out, document, "og:site_name", "ogSiteName");
    insert_meta_property!(out, document, "og:video", "ogVideo");
    insert_meta_name!(out, document, "article:section", "articleSection");
    insert_meta_name!(out, document, "article:tag", "articleTag");
    insert_meta_property!(out, document, "article:published_time", "publishedTime");
    insert_meta_property!(out, document, "article:modified_time", "modifiedTime");
    insert_meta_name!(out, document, "dcterms.keywords", "dcTermsKeywords");
    insert_meta_name!(out, document, "dc.description", "dcDescription");
    insert_meta_name!(out, document, "dc.subject", "dcSubject");
    insert_meta_name!(out, document, "dcterms.subject", "dcTermsSubject");
    insert_meta_name!(out, document, "dcterms.audience", "dcTermsAudience");
    insert_meta_name!(out, document, "dc.type", "dcType");
    insert_meta_name!(out, document, "dcterms.type", "dcTermsType");
    insert_meta_name!(out, document, "dc.date", "dcDate");
    insert_meta_name!(out, document, "dc.date.created", "dcDateCreated");
    insert_meta_name!(out, document, "dcterms.created", "dcTermsCreated");

    for meta in document.select("meta").unwrap() {
        let meta = meta.as_node().as_element().unwrap();
        let attrs = meta.attributes.borrow();

        if let Some(name) = attrs.get("name").or_else(|| attrs.get("property")) {
            if let Some(content) = attrs.get("content") {
                if let Some(v) = out.get(name) {
                    match v {
                        Value::String(_) => {
                            if name != "title" { // preserve title tag in metadata
                                out.insert(name.to_string(), Value::Array(vec! [v.clone(), Value::String(content.to_string())]));
                            }
                        },
                        Value::Array(_) => {
                            match out.get_mut(name) {
                                Some(Value::Array(x)) => {
                                    x.push(Value::String(content.to_string()));
                                },
                                _ => unreachable!(),
                            }
                        },
                        _ => unreachable!(),
                    }
                } else {
                    out.insert(name.to_string(), Value::String(content.to_string()));
                }
            }
        }
    }

    CString::new(serde_json::ser::to_string(&out).unwrap()).unwrap().into_raw()
}

const EXCLUDE_NON_MAIN_TAGS: [&str; 41] = [
    "header",
    "footer",
    "nav",
    "aside",
    ".header",
    ".top",
    ".navbar",
    "#header",
    ".footer",
    ".bottom",
    "#footer",
    ".sidebar",
    ".side",
    ".aside",
    "#sidebar",
    ".modal",
    ".popup",
    "#modal",
    ".overlay",
    ".ad",
    ".ads",
    ".advert",
    "#ad",
    ".lang-selector",
    ".language",
    "#language-selector",
    ".social",
    ".social-media",
    ".social-links",
    "#social",
    ".menu",
    ".navigation",
    "#nav",
    ".breadcrumbs",
    "#breadcrumbs",
    ".share",
    "#share",
    ".widget",
    "#widget",
    ".cookie",
    "#cookie",
];

const FORCE_INCLUDE_MAIN_TAGS: [&str; 1] = [
    "#main"
];

#[derive(Deserialize)]
struct TranformHTMLOptions {
    html: String,
    url: String,
    include_tags: Vec<String>,
    exclude_tags: Vec<String>,
    only_main_content: bool,
}

struct ImageSource {
    url: String,
    size: i32,
    is_x: bool,
}

fn _transform_html_inner(opts: TranformHTMLOptions) -> Result<String, ()> {
    let mut document = parse_html().one(opts.html);
    
    if !opts.include_tags.is_empty() {
        let new_document = parse_html().one("<div></div>");
        let root = new_document.select_first("div")?;

        for x in opts.include_tags.iter() {
            let matching_nodes: Vec<_> = document.select(x)?.collect();
            for tag in matching_nodes {
                root.as_node().append(tag.as_node().clone());
            }
        }

        document = new_document;
    }

    while let Ok(x) = document.select_first("head") {
        x.as_node().detach();
    }

    while let Ok(x) = document.select_first("meta") {
        x.as_node().detach();
    }

    while let Ok(x) = document.select_first("noscript") {
        x.as_node().detach();
    }

    while let Ok(x) = document.select_first("style") {
        x.as_node().detach();
    }

    while let Ok(x) = document.select_first("script") {
        x.as_node().detach();
    }

    for x in opts.exclude_tags.iter() {
        // TODO: implement weird version
        while let Ok(x) = document.select_first(x) {
            x.as_node().detach();
        }
    }

    if opts.only_main_content {
        for x in EXCLUDE_NON_MAIN_TAGS.iter() {
            let x: Vec<_> = document.select(x)?.collect();
            for tag in x {
                if !FORCE_INCLUDE_MAIN_TAGS.iter().any(|x| tag.as_node().select(x).is_ok_and(|mut x| x.next().is_some())) {
                    tag.as_node().detach();
                }
            }
        }
    }

    let srcset_images: Vec<_> = document.select("img[srcset]")?.collect();
    for img in srcset_images {
        let mut sizes: Vec<ImageSource> = img.attributes.borrow().get("srcset").ok_or(())?.split(",").filter_map(|x| {
            let tok: Vec<&str> = x.trim().split(" ").collect();
            let tok_1 = if tok.len() > 1 && !tok[1].is_empty() {
                tok[1]
            } else {
                "1x"
            };
            if let Ok(parsed_size) = tok_1[..tok_1.len()-1].parse() {
                Some(ImageSource {
                    url: tok[0].to_string(),
                    size: parsed_size,
                    is_x: tok_1.ends_with("x")
                })
            } else {
                None
            }
        }).collect();

        if sizes.iter().all(|x| x.is_x) {
            if let Some(src) = img.attributes.borrow().get("src").map(|x| x.to_string()) {
                sizes.push(ImageSource {
                    url: src,
                    size: 1,
                    is_x: true,
                });
            }
        }

        sizes.sort_by(|a, b| b.size.cmp(&a.size));

        if let Some(biggest) = sizes.first() {
            img.attributes.borrow_mut().insert("src", biggest.url.clone());
        }
    }

    let url = Url::parse(&opts.url).map_err(|_| ())?;
    
    let src_images: Vec<_> = document.select("img[src]")?.collect();
    for img in src_images {
        let old = img.attributes.borrow().get("src").map(|x| x.to_string()).ok_or(())?;
        if let Ok(new) = url.join(&old) {
            img.attributes.borrow_mut().insert("src", new.to_string());            
        }
    }

    let href_anchors: Vec<_> = document.select("a[href]")?.collect();
    for anchor in href_anchors {
        let old = anchor.attributes.borrow().get("href").map(|x| x.to_string()).ok_or(())?;
        if let Ok(new) = url.join(&old) {
            anchor.attributes.borrow_mut().insert("href", new.to_string());            
        }
    }

    Ok(document.to_string())
}

/// Transforms rawHtml to html (formerly removeUnwantedElements)
/// 
/// # Safety
/// Input options must be a C JSON string. Output will be an HTML string. Output string must be freed with free_string.
#[no_mangle]
pub unsafe extern "C" fn transform_html(opts: *const libc::c_char) -> *mut libc::c_char {
    let opts: TranformHTMLOptions = match unsafe { CStr::from_ptr(opts) }.to_str().map_err(|_| ()).and_then(|x| serde_json::de::from_str(x).map_err(|_| ())) {
        Ok(x) => x,
        Err(_) => {
            return CString::new("RUSTFC:ERROR").unwrap().into_raw();
        }
    };

    let out = match _transform_html_inner(opts) {
        Ok(x) => x,
        Err(_) => "RUSTFC:ERROR".to_string(),
    };

    CString::new(out).unwrap().into_raw()
}

fn _get_inner_json(html: &str) -> Result<String, ()> {
    Ok(parse_html().one(html).select_first("body")?.text_contents())
}

/// For JSON pages retrieved by browser engines, this function can be used to transform it back into valid JSON.
/// 
/// # Safety
/// Input must be a C HTML string. Output will be an HTML string. Output string must be freed with free_string.
#[no_mangle]
pub unsafe extern "C" fn get_inner_json(html: *const libc::c_char) -> *mut libc::c_char {
    let html = unsafe { CStr::from_ptr(html) }.to_str().unwrap();

    let out = match _get_inner_json(html) {
        Ok(x) => x,
        Err(_) => "RUSTFC:ERROR".to_string(),
    };

    CString::new(out).unwrap().into_raw()
}

/// Frees a string allocated in Rust-land.
/// 
/// # Safety
/// ptr must be a non-freed string pointer returned by Rust code.
#[no_mangle]
pub unsafe extern "C" fn free_string(ptr: *mut i8) {
    drop(unsafe { CString::from_raw(ptr) })
}
