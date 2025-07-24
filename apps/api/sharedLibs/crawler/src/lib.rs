use std::{collections::HashMap, usize};
use serde::{Deserialize, Serialize};
use std::ffi::{CStr, CString};
use url::Url;
use regex::Regex;
use robotstxt::DefaultMatcher;

#[derive(Deserialize)]
struct FilterLinksCall {
    links: Vec<String>,
    limit: Option<i64>,
    max_depth: u32,
    base_url: String,
    initial_url: String,
    regex_on_full_url: bool,
    excludes: Vec<String>,
    includes: Vec<String>,
    allow_backward_crawling: bool,
    ignore_robots_txt: bool,
    robots_txt: String,
}

#[derive(Serialize)]
struct FilterLinksResult {
    links: Vec<String>,
    denial_reasons: HashMap<String, String>,
}

#[derive(Serialize)]
struct SitemapUrl {
    loc: Vec<String>,
}

#[derive(Serialize)]
struct SitemapEntry {
    loc: Vec<String>,
}

#[derive(Serialize)]
struct ParsedSitemap {
    urlset: Option<SitemapUrlset>,
    sitemapindex: Option<SitemapIndex>,
}

#[derive(Serialize)]
struct SitemapUrlset {
    url: Vec<SitemapUrl>,
}

#[derive(Serialize)]
struct SitemapIndex {
    sitemap: Vec<SitemapEntry>,
}

fn _is_file(url: &Url) -> bool {
    let file_extensions = vec![
        ".css",
        ".js",
        ".ico",
        ".svg",
        ".tiff",
        ".zip",
        ".exe",
        ".dmg",
        ".mp4",
        ".mp3",
        ".wav",
        ".pptx",
        ".xlsx",
        ".avi",
        ".flv",
        ".woff",
        ".ttf",
        ".woff2",
        ".webp",
        ".inc",
    ];
    let url_without_query = url.path().to_lowercase();
    file_extensions.iter().any(|ext| url_without_query.ends_with(ext))
}

fn _get_url_depth(path: &str) -> u32 {
    path.split('/').filter(|x| *x != "" && *x != "index.php" && *x != "index.html").count() as u32
}

fn _filter_links(data: FilterLinksCall) -> Result<FilterLinksResult, Box<dyn std::error::Error>> {
    let mut denial_reasons = HashMap::new();

    let limit = data.limit
        .and_then(|x| if x < 0 { Some(0) } else { Some(x as usize) })
        .unwrap_or(usize::MAX);

    if limit == 0 {
        return Ok(FilterLinksResult {
            links: Vec::with_capacity(0),
            denial_reasons,
        });
    }

    let base_url = Url::parse(&data.base_url)?;
    let initial_url = Url::parse(&data.initial_url)?;

    let excludes_regex = data.excludes.iter().map(|exclude| Regex::new(exclude)).collect::<Vec<Result<Regex, regex::Error>>>();
    let excludes_regex = excludes_regex.into_iter().filter_map(|x| x.ok()).collect::<Vec<Regex>>();

    let includes_regex = data.includes.iter().map(|include| Regex::new(include)).collect::<Vec<Result<Regex, regex::Error>>>();
    let includes_regex = includes_regex.into_iter().filter_map(|x| x.ok()).collect::<Vec<Regex>>();

    let links = data.links.into_iter()
        .filter(|link| {
            let url = match base_url.join(link) {
                Ok(x) => x,
                Err(_) => {
                    denial_reasons.insert(link.clone(), "URL_PARSE_ERROR".to_string());
                    return false;
                }
            };

            let path = url.path();
            let depth = _get_url_depth(path);
            if depth > data.max_depth {
                denial_reasons.insert(link.clone(), "DEPTH_LIMIT".to_string());
                return false;
            }

            let exinc_path = if data.regex_on_full_url {
                url.as_str()
            } else {
                url.path()
            };

            if !excludes_regex.is_empty() && excludes_regex.iter().any(|regex| regex.is_match(exinc_path)) {
                denial_reasons.insert(link.clone(), "EXCLUDE_PATTERN".to_string());
                return false;
            }

            if !includes_regex.is_empty() && !includes_regex.iter().any(|regex| regex.is_match(exinc_path)) {
                denial_reasons.insert(link.clone(), "INCLUDE_PATTERN".to_string());
                return false;
            }

            if !data.allow_backward_crawling {
                if !url.path().starts_with(initial_url.path()) {
                    denial_reasons.insert(link.clone(), "BACKWARD_CRAWLING".to_string());
                    return false;
                }
            }

            if !data.ignore_robots_txt {
                let mut matcher = DefaultMatcher::default();
                let allowed = matcher.allowed_by_robots(&data.robots_txt, vec![
                    "FireCrawlAgent",
                    "FirecrawlAgent",
                ], url.as_str());

                if !allowed {
                    denial_reasons.insert(link.clone(), "ROBOTS_TXT".to_string());
                    return false;
                }
            }

            if _is_file(&url) {
                denial_reasons.insert(link.clone(), "FILE_TYPE".to_string());
                return false;
            }

            true
        })
        .take(limit)
        .collect::<Vec<_>>();

    Ok(FilterLinksResult {
        links,
        denial_reasons,
    })
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn filter_links(data: *const libc::c_char) -> *mut libc::c_char {
    let data = match serde_json::from_slice(unsafe { CStr::from_ptr(data).to_bytes() }) {
        Ok(x) => x,
        Err(e) => {
            return CString::new(format!("RUSTFC:ERROR:Failed to parse input data as C string: {}", e)).unwrap().into_raw();
        }
    };

    let result = match _filter_links(data) {
        Ok(x) => x,
        Err(e) => {
            return CString::new(format!("RUSTFC:ERROR:{}", e)).unwrap().into_raw();
        }
    };

    let result = match serde_json::to_string(&result) {
        Ok(x) => x,
        Err(e) => {
            return CString::new(format!("RUSTFC:ERROR:Failed to serialize result as JSON {}", e)).unwrap().into_raw();
        }
    };

    CString::new(result).unwrap().into_raw()
}

fn _parse_sitemap_xml(xml_content: &str) -> Result<ParsedSitemap, Box<dyn std::error::Error>> {
    let doc = roxmltree::Document::parse(xml_content)?;
    let root = doc.root_element();
    
    match root.tag_name().name() {
        "sitemapindex" => {
            let mut sitemaps = Vec::new();
            
            for sitemap_node in root.children().filter(|n| n.is_element() && n.tag_name().name() == "sitemap") {
                if let Some(loc_node) = sitemap_node.children().find(|n| n.is_element() && n.tag_name().name() == "loc") {
                    if let Some(loc_text) = loc_node.text() {
                        sitemaps.push(SitemapEntry {
                            loc: vec![loc_text.to_string()],
                        });
                    }
                }
            }
            
            Ok(ParsedSitemap {
                urlset: None,
                sitemapindex: Some(SitemapIndex { sitemap: sitemaps }),
            })
        },
        "urlset" => {
            let mut urls = Vec::new();
            
            for url_node in root.children().filter(|n| n.is_element() && n.tag_name().name() == "url") {
                if let Some(loc_node) = url_node.children().find(|n| n.is_element() && n.tag_name().name() == "loc") {
                    if let Some(loc_text) = loc_node.text() {
                        urls.push(SitemapUrl {
                            loc: vec![loc_text.to_string()],
                        });
                    }
                }
            }
            
            Ok(ParsedSitemap {
                urlset: Some(SitemapUrlset { url: urls }),
                sitemapindex: None,
            })
        },
        _ => {
            Err("Invalid sitemap format: root element must be 'sitemapindex' or 'urlset'".into())
        }
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn parse_sitemap_xml(data: *const libc::c_char) -> *mut libc::c_char {
    let xml_content = match unsafe { CStr::from_ptr(data).to_str() } {
        Ok(s) => s,
        Err(e) => {
            return CString::new(format!("RUSTFC:ERROR:Failed to parse input data as UTF-8 string: {}", e)).unwrap().into_raw();
        }
    };

    let result = match _parse_sitemap_xml(xml_content) {
        Ok(x) => x,
        Err(e) => {
            return CString::new(format!("RUSTFC:ERROR:{}", e)).unwrap().into_raw();
        }
    };

    let result = match serde_json::to_string(&result) {
        Ok(x) => x,
        Err(e) => {
            return CString::new(format!("RUSTFC:ERROR:Failed to serialize result as JSON {}", e)).unwrap().into_raw();
        }
    };

    CString::new(result).unwrap().into_raw()
}

/// Frees a string allocated in Rust-land.
/// 
/// # Safety
/// ptr must be a non-freed string pointer returned by Rust code.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn free_string(ptr: *mut libc::c_char) {
    drop(unsafe { CString::from_raw(ptr) })
}
