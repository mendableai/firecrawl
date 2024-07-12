use firecrawl_rs::FirecrawlApp;
use serde_json::json;
use uuid::Uuid;
use dotenv::dotenv;
use std::env;
use tokio::time::sleep;
use std::time::Duration;
use assert_matches::assert_matches;

#[tokio::test]
async fn test_no_api_key() {
    dotenv().ok();
    let api_url = env::var("API_URL").unwrap();
    assert_matches!(FirecrawlApp::new(None, Some(api_url)), Err(e) if e.to_string() == "No API key provided");
}

#[tokio::test]
async fn test_scrape_url_invalid_api_key() {
    dotenv().ok();
    let api_url = env::var("API_URL").unwrap();
    let app = FirecrawlApp::new(Some("invalid_api_key".to_string()), Some(api_url)).unwrap();
    let result = app.scrape_url("https://firecrawl.dev", None).await;
    assert_matches!(result, Err(e) if e.to_string() == "Unexpected error during scrape URL: Status code 401. Unauthorized: Invalid token");
}

#[tokio::test]
async fn test_blocklisted_url() {
    dotenv().ok();
    let api_url = env::var("API_URL").unwrap();
    let api_key = env::var("TEST_API_KEY").unwrap();
    let app = FirecrawlApp::new(Some(api_key), Some(api_url)).unwrap();
    let blocklisted_url = "https://facebook.com/fake-test";
    let result = app.scrape_url(blocklisted_url, None).await;
    assert_matches!(result, Err(e) if e.to_string() == "Unexpected error during scrape URL: Status code 403. Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it.");
}

#[tokio::test]
async fn test_successful_response_with_valid_preview_token() {
    dotenv().ok();
    let api_url = env::var("API_URL").unwrap();
    let app = FirecrawlApp::new(Some("this_is_just_a_preview_token".to_string()), Some(api_url)).unwrap();
    let result = app.scrape_url("https://roastmywebsite.ai", None).await.unwrap();
    assert!(result.as_object().unwrap().contains_key("content"));
    assert!(result["content"].as_str().unwrap().contains("_Roast_"));
}

#[tokio::test]
async fn test_scrape_url_e2e() {
    dotenv().ok();
    let api_url = env::var("API_URL").unwrap();
    let api_key = env::var("TEST_API_KEY").unwrap();
    let app = FirecrawlApp::new(Some(api_key), Some(api_url)).unwrap();
    let result = app.scrape_url("https://roastmywebsite.ai", None).await.unwrap();
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
    let result = app.scrape_url("https://roastmywebsite.ai", Some(params)).await.unwrap();
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
    let result = app.scrape_url("https://arxiv.org/pdf/astro-ph/9301001.pdf", None).await.unwrap();
    assert!(result.as_object().unwrap().contains_key("content"));
    assert!(result.as_object().unwrap().contains_key("metadata"));
    assert!(result["content"].as_str().unwrap().contains("We present spectrophotometric observations of the Broad Line Radio Galaxy"));
}

#[tokio::test]
async fn test_successful_response_for_valid_scrape_with_pdf_file_without_explicit_extension() {
    dotenv().ok();
    let api_url = env::var("API_URL").unwrap();
    let api_key = env::var("TEST_API_KEY").unwrap();
    let app = FirecrawlApp::new(Some(api_key), Some(api_url)).unwrap();
    let result = app.scrape_url("https://arxiv.org/pdf/astro-ph/9301001", None).await.unwrap();
    sleep(Duration::from_secs(6)).await; // wait for 6 seconds
    assert!(result.as_object().unwrap().contains_key("content"));
    assert!(result.as_object().unwrap().contains_key("metadata"));
    assert!(result["content"].as_str().unwrap().contains("We present spectrophotometric observations of the Broad Line Radio Galaxy"));
}

#[tokio::test]
async fn test_crawl_url_invalid_api_key() {
    dotenv().ok();
    let api_url = env::var("API_URL").unwrap();
    let app = FirecrawlApp::new(Some("invalid_api_key".to_string()), Some(api_url)).unwrap();
    let result = app.crawl_url("https://firecrawl.dev", None, true, 1, None).await;
    assert_matches!(result, Err(e) if e.to_string() == "Unexpected error during start crawl job: Status code 401. Unauthorized: Invalid token");
}

#[tokio::test]
async fn test_should_return_error_for_blocklisted_url() {
    dotenv().ok();
    let api_url = env::var("API_URL").unwrap();
    let api_key = env::var("TEST_API_KEY").unwrap();
    let app = FirecrawlApp::new(Some(api_key), Some(api_url)).unwrap();
    let blocklisted_url = "https://twitter.com/fake-test";
    let result = app.crawl_url(blocklisted_url, None, true, 1, None).await;
    assert_matches!(result, Err(e) if e.to_string() == "Unexpected error during start crawl job: Status code 403. Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it.");
}

#[tokio::test]
async fn test_crawl_url_wait_for_completion_e2e() {
    dotenv().ok();
    let api_url = env::var("API_URL").unwrap();
    let api_key = env::var("TEST_API_KEY").unwrap();
    let app = FirecrawlApp::new(Some(api_key), Some(api_url)).unwrap();
    let params = json!({
        "crawlerOptions": {
            "excludes": ["blog/*"]
        }
    });
    let result = app.crawl_url("https://roastmywebsite.ai", Some(params), true, 1, None).await.unwrap();
    let result_as_str = result.as_object().unwrap();
    assert!(result_as_str.len() > 0);
    // assert!(result_as_str[0].contains_key("content"));
    // assert!(result[0]["content"].as_str().unwrap().contains("_Roast_"));
}

#[tokio::test]
async fn test_crawl_url_with_idempotency_key_e2e() {
    dotenv().ok();
    let api_url = env::var("API_URL").unwrap();
    let api_key = env::var("TEST_API_KEY").unwrap();
    let app = FirecrawlApp::new(Some(api_key), Some(api_url)).unwrap();
    let unique_idempotency_key = Uuid::new_v4().to_string();
    let params = json!({
        "crawlerOptions": {
            "excludes": ["blog/*"]
        }
    });
    let result = app.crawl_url("https://roastmywebsite.ai", Some(params), true, 2, Some(unique_idempotency_key.clone())).await.unwrap();

    let result_as_str = result.as_object().unwrap();
    assert!(result_as_str.len() > 0);
    // assert!(result[0].contains_key("content"));
    // assert!(result[0]["content"].as_str().unwrap().contains("_Roast_"));

    let conflict_result = app.crawl_url("https://firecrawl.dev", Some(params), true, 2, Some(unique_idempotency_key)).await;
    assert_matches!(conflict_result, Err(e) if e.to_string() == "Conflict: Failed to start crawl job due to a conflict. Idempotency key already used");
}

#[tokio::test]
async fn test_check_crawl_status_e2e() {
    dotenv().ok();
    let api_url = env::var("API_URL").unwrap();
    let api_key = env::var("TEST_API_KEY").unwrap();
    let app = FirecrawlApp::new(Some(api_key), Some(api_url)).unwrap();
    let params = json!({
        "crawlerOptions": {
            "excludes": ["blog/*"]
        }
    });
    let result = app.crawl_url("https://firecrawl.dev", Some(params), false, 1, None).await.unwrap();
    assert!(result.as_object().unwrap().contains_key("jobId"));

    sleep(Duration::from_secs(30)).await; // wait for 30 seconds
    let status_response = app.check_crawl_status(result["jobId"].as_str().unwrap()).await.unwrap();
    assert!(status_response.as_object().unwrap().contains_key("status"));
    assert_eq!(status_response["status"].as_str().unwrap(), "completed");
    assert!(status_response.as_object().unwrap().contains_key("data"));
    assert!(status_response["data"].as_array().unwrap().len() > 0);
}

#[tokio::test]
async fn test_search_e2e() {
    dotenv().ok();
    let api_url = env::var("API_URL").unwrap();
    let api_key = env::var("TEST_API_KEY").unwrap();
    let app = FirecrawlApp::new(Some(api_key), Some(api_url)).unwrap();
    let result = app.search("test query").await.unwrap();
    assert!(result.as_object().unwrap().len() > 2);
    //assert!(result.as_object().unwrap()[0].contains_key("content"));
}

#[tokio::test]
async fn test_search_invalid_api_key() {
    dotenv().ok();
    let api_url = env::var("API_URL").unwrap();
    let app = FirecrawlApp::new(Some("invalid_api_key".to_string()), Some(api_url)).unwrap();
    let result = app.search("test query").await;
    assert_matches!(result, Err(e) if e.to_string() == "Unexpected error during search: Status code 401. Unauthorized: Invalid token");
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
    let result = app.scrape_url("https://mendable.ai", Some(params)).await.unwrap();
    assert!(result.as_object().unwrap().contains_key("llm_extraction"));
    let llm_extraction = &result["llm_extraction"];
    assert!(llm_extraction.as_object().unwrap().contains_key("company_mission"));
    assert!(llm_extraction["supports_sso"].is_boolean());
    assert!(llm_extraction["is_open_source"].is_boolean());
}
