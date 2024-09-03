use assert_matches::assert_matches;
use dotenv::dotenv;
use firecrawl::FirecrawlApp;
use serde_json::json;
use std::env;
use std::time::Duration;
use tokio::time::sleep;

#[tokio::test]
async fn test_no_api_key() {
    dotenv().ok();
    let api_url = env::var("API_URL").expect("API_URL environment variable is not set");
    assert_matches!(FirecrawlApp::new(None, Some(api_url)), Err(e) if e.to_string() == "API key not provided");
}

#[tokio::test]
async fn test_blocklisted_url() {
    dotenv().ok();
    let api_url = env::var("API_URL").unwrap();
    let api_key = env::var("TEST_API_KEY").unwrap();
    let app = FirecrawlApp::new(Some(api_key), Some(api_url)).unwrap();
    let blocklisted_url = "https://facebook.com/fake-test";
    let result = app.scrape_url(blocklisted_url, None).await;

    assert_matches!(
        result,
        Err(e) if e.to_string().contains("Firecrawl currently does not support social media scraping due to policy restrictions")
    );
}

#[tokio::test]
async fn test_successful_response_with_valid_preview_token() {
    dotenv().ok();
    let api_url = env::var("API_URL").unwrap();
    let app = FirecrawlApp::new(
        Some("this_is_just_a_preview_token".to_string()),
        Some(api_url),
    )
    .unwrap();
    let result = app
        .scrape_url("https://roastmywebsite.ai", None)
        .await
        .unwrap();
    assert!(result.as_object().unwrap().contains_key("content"));
    assert!(result["content"].as_str().unwrap().contains("_Roast_"));
}

#[tokio::test]
async fn test_scrape_url_e2e() {
    dotenv().ok();
    let api_url = env::var("API_URL").unwrap();
    let api_key = env::var("TEST_API_KEY").unwrap();
    let app = FirecrawlApp::new(Some(api_key), Some(api_url)).unwrap();
    let result = app
        .scrape_url("https://roastmywebsite.ai", None)
        .await
        .unwrap();
    assert!(result.as_object().unwrap().contains_key("content"));
    assert!(result.as_object().unwrap().contains_key("markdown"));
    assert!(result.as_object().unwrap().contains_key("metadata"));
    assert!(!result.as_object().unwrap().contains_key("html"));
    assert!(result["content"].as_str().unwrap().contains("_Roast_"));
}

#[tokio::test]
async fn test_successful_response_with_valid_api_key_and_include_html() {
    dotenv().ok();
    let api_url = env::var("API_URL").unwrap();
    let api_key = env::var("TEST_API_KEY").unwrap();
    let app = FirecrawlApp::new(Some(api_key), Some(api_url)).unwrap();
    let params = json!({
        "pageOptions": {
            "includeHtml": true
        }
    });
    let result = app
        .scrape_url("https://roastmywebsite.ai", Some(params))
        .await
        .unwrap();
    assert!(result.as_object().unwrap().contains_key("content"));
    assert!(result.as_object().unwrap().contains_key("markdown"));
    assert!(result.as_object().unwrap().contains_key("html"));
    assert!(result.as_object().unwrap().contains_key("metadata"));
    assert!(result["content"].as_str().unwrap().contains("_Roast_"));
    assert!(result["markdown"].as_str().unwrap().contains("_Roast_"));
    assert!(result["html"].as_str().unwrap().contains("<h1"));
}

#[tokio::test]
async fn test_successful_response_for_valid_scrape_with_pdf_file() {
    dotenv().ok();
    let api_url = env::var("API_URL").unwrap();
    let api_key = env::var("TEST_API_KEY").unwrap();
    let app = FirecrawlApp::new(Some(api_key), Some(api_url)).unwrap();
    let result = app
        .scrape_url("https://arxiv.org/pdf/astro-ph/9301001.pdf", None)
        .await
        .unwrap();
    assert!(result.as_object().unwrap().contains_key("content"));
    assert!(result.as_object().unwrap().contains_key("metadata"));
    assert!(result["content"]
        .as_str()
        .unwrap()
        .contains("We present spectrophotometric observations of the Broad Line Radio Galaxy"));
}

#[tokio::test]
async fn test_successful_response_for_valid_scrape_with_pdf_file_without_explicit_extension() {
    dotenv().ok();
    let api_url = env::var("API_URL").unwrap();
    let api_key = env::var("TEST_API_KEY").unwrap();
    let app = FirecrawlApp::new(Some(api_key), Some(api_url)).unwrap();
    let result = app
        .scrape_url("https://arxiv.org/pdf/astro-ph/9301001", None)
        .await
        .unwrap();
    sleep(Duration::from_secs(6)).await; // wait for 6 seconds
    assert!(result.as_object().unwrap().contains_key("content"));
    assert!(result.as_object().unwrap().contains_key("metadata"));
    assert!(result["content"]
        .as_str()
        .unwrap()
        .contains("We present spectrophotometric observations of the Broad Line Radio Galaxy"));
}

#[tokio::test]
async fn test_should_return_error_for_blocklisted_url() {
    dotenv().ok();
    let api_url = env::var("API_URL").unwrap();
    let api_key = env::var("TEST_API_KEY").unwrap();
    let app = FirecrawlApp::new(Some(api_key), Some(api_url)).unwrap();
    let blocklisted_url = "https://twitter.com/fake-test";
    let result = app.crawl_url(blocklisted_url, None, true, 1, None).await;

    assert_matches!(
        result,
        Err(e) if e.to_string().contains("Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it.")
    );
}

#[tokio::test]
async fn test_llm_extraction() {
    dotenv().ok();
    let api_url = env::var("API_URL").unwrap();
    let api_key = env::var("TEST_API_KEY").unwrap();
    let app = FirecrawlApp::new(Some(api_key), Some(api_url)).unwrap();
    let params = json!({
        "extractorOptions": {
            "mode": "llm-extraction",
            "extractionPrompt": "Based on the information on the page, find what the company's mission is and whether it supports SSO, and whether it is open source",
            "extractionSchema": {
                "type": "object",
                "properties": {
                    "company_mission": {"type": "string"},
                    "supports_sso": {"type": "boolean"},
                    "is_open_source": {"type": "boolean"}
                },
                "required": ["company_mission", "supports_sso", "is_open_source"]
            }
        }
    });
    let result = app
        .scrape_url("https://mendable.ai", Some(params))
        .await
        .unwrap();
    assert!(result.as_object().unwrap().contains_key("llm_extraction"));
    let llm_extraction = &result["llm_extraction"];
    assert!(llm_extraction
        .as_object()
        .unwrap()
        .contains_key("company_mission"));
    assert!(llm_extraction["supports_sso"].is_boolean());
    assert!(llm_extraction["is_open_source"].is_boolean());
}
