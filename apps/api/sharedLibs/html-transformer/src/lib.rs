use std::{collections::HashMap, ffi::{CStr, CString}};

use kuchikiki::{parse_html, traits::TendrilSink};
use serde_json::Value;

// #[no_mangle]
// pub extern "C" fn extract_links(html: *const libc::c_char) -> *mut i8 {
//     let html = unsafe { CStr::from_ptr(html) }.to_str().unwrap();

//     let mut output = vec![];
    
//     let mut rewriter = HtmlRewriter::new(
//         Settings {
//             element_content_handlers: vec! [
//                 element!("")
//             ],
//             ..Settings::new()
//         },
//         |c: &[u8]| output.extend_from_slice(c)
//     );

//     rewriter.write(html.as_bytes()).unwrap();

//     CString::new(String::from_utf8(output).unwrap()).unwrap().into_raw()
// }

#[no_mangle]
pub extern "C" fn extract_links(html: *const libc::c_char) -> *mut i8 {
    let html = unsafe { CStr::from_ptr(html) }.to_str().unwrap();

    let document = parse_html().one(html);

    let mut out: Vec<String> = Vec::new();

    for anchor in document.select("a[href]").unwrap() {
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


#[no_mangle]
pub extern "C" fn extract_metadata(html: *const libc::c_char) -> *mut i8 {
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
                            out.insert(name.to_string(), Value::Array(vec! [v.clone(), Value::String(content.to_string())]));
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

#[no_mangle]
pub extern "C" fn free_string(ptr: *mut i8) {
    drop(unsafe { CString::from_raw(ptr) })
}
