use crate::{scrape::ScrapeOptions, FirecrawlApp, FirecrawlError, API_VERSION};
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchParams {
    /// The search query string
    pub query: String,
    /// Maximum number of results to return. Default: 5, Max: 20
    pub limit: Option<u32>,
    /// Time-based search filter.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tbs: Option<String>,
    /// Query string to filter search results. Example: "site:example.com"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filter: Option<String>,
    /// Language code. Default: "en"
    pub lang: Option<String>,
    /// Country code. Default: "us"
    pub country: Option<String>,
    /// Geographic location string for local search results
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    /// Origin identifier. Default: "api"
    pub origin: Option<String>,
    /// Timeout in milliseconds. Default: 60000
    pub timeout: Option<u32>,
    /// Additional options for webpage scraping behavior
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scrape_options: Option<ScrapeOptions>,
}

impl Default for SearchParams {
    fn default() -> Self {
        Self {
            query: String::new(),
            limit: Some(5),
            tbs: None,
            filter: None,
            lang: Some("en".to_string()),
            country: Some("us".to_string()),
            location: None,
            origin: Some("api".to_string()),
            timeout: Some(60000),
            scrape_options: None,
        }
    }
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub success: bool,
    pub data: Vec<SearchDocument>,
    pub warning: Option<String>,
}

// TODO: Consider merging fields into document::Document (url, title, description) while preserving optionality
/// A document returned from a search or scrape request
#[serde_with::skip_serializing_none]
#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchDocument {
    /// Document URL
    pub url: String,
    /// Document title
    pub title: String,
    /// Document description
    pub description: String,
}

impl FirecrawlApp {
    /// Search for content using the Firecrawl API.
    ///
    /// # Arguments
    ///
    /// * `query` - The search query string
    /// * `params` - Optional parameters for the search request
    ///
    /// # Returns
    ///
    /// A SearchResponse containing the search results, or a FirecrawlError if the request fails.
    pub async fn search(
        &self,
        query: impl AsRef<str>,
        params: impl Into<Option<SearchParams>>,
    ) -> Result<SearchResponse, FirecrawlError> {
        let mut search_params = params.into().unwrap_or_default();
        search_params.query = query.as_ref().to_string();

        self.search_with_params(search_params).await
    }

    /// Alternative method that takes SearchParams directly
    ///
    /// # Arguments
    ///
    /// * `params` - Search parameters including the query
    ///
    /// # Returns
    ///
    /// A SearchResponse containing the search results, or a FirecrawlError if the request fails.
    pub async fn search_with_params(
        &self,
        params: SearchParams,
    ) -> Result<SearchResponse, FirecrawlError> {
        let headers = self.prepare_headers(None);

        let response = self
            .client
            .post(format!("{}{}/search", self.api_url, API_VERSION))
            .headers(headers)
            .json(&params)
            .send()
            .await
            .map_err(|e| {
                FirecrawlError::HttpError(format!("Searching with query: {:?}", params.query), e)
            })?;

        self.handle_response::<SearchResponse>(response, "search")
            .await
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    #[ignore = "Makes real network request"]
    async fn test_real_search() {
        let api_url = std::env::var("FIRECRAWL_API_URL")
            .expect("Please set the FIRECRAWL_API_URL environment variable");
        let app = FirecrawlApp::new_selfhosted(api_url, None::<&str>).unwrap();
        let response = app.search("test query", None).await.unwrap();
        assert!(response.success);
    }

    #[tokio::test]
    async fn test_search_with_mock() {
        let mut server = mockito::Server::new_async().await;

        let mock = server
            .mock("POST", "/v1/search")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "success": true,
                    "data": [{
                        "url": "https://example.com",
                        "title": "Example Domain",
                        "description": "...."
                    }],
                })
                .to_string(),
            )
            .create();

        let app = FirecrawlApp::new_selfhosted(server.url(), Some("test_key")).unwrap();
        let response = app.search("test", None).await.unwrap();

        assert!(response.success);
        assert_eq!(response.data.len(), 1);
        assert_eq!(response.data[0].url, "https://example.com");
        assert_eq!(response.data[0].title, "Example Domain".to_string());
        assert_eq!(response.data[0].description, "....".to_string());
        mock.assert();
    }

    #[tokio::test]
    async fn test_search_with_params() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("POST", "/v1/search")
            .with_header("content-type", "application/json")
            .match_body(mockito::Matcher::Json(json!({
                "query": "test",
                "limit": 10,
                "lang": "fr",
                "country": "fr",
                "origin": "api",
                "timeout": 30000
            })))
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "success": true,
                    "data": [],
                    "warning": "No results found"
                })
                .to_string(),
            )
            .create();

        let app = FirecrawlApp::new_selfhosted(server.url(), Some("test_key")).unwrap();
        let params = SearchParams {
            query: "test".to_string(),
            limit: Some(10),
            lang: Some("fr".to_string()),
            country: Some("fr".to_string()),
            timeout: Some(30000),
            ..Default::default()
        };

        let response = app.search_with_params(params).await.unwrap();

        assert!(response.success);
        assert_eq!(response.data.len(), 0);
        assert_eq!(response.warning, Some("No results found".to_string()));
        mock.assert();
    }

    #[tokio::test]
    async fn test_search_error_response() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("POST", "/v1/search")
            .with_status(400)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "success": false,
                    "error": "Invalid query"
                })
                .to_string(),
            )
            .create();

        let app = FirecrawlApp::new_selfhosted(server.url(), Some("test_key")).unwrap();
        let result = app.search("", None).await;

        assert!(result.is_err());
        mock.assert();
    }

    #[tokio::test]
    async fn test_search_network_error() {
        let app = FirecrawlApp::new_selfhosted("http://invalid-url", Some("test_key")).unwrap();
        let result = app.search("test", None).await;
        assert!(result.is_err());
    }
}
