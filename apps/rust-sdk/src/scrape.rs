use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{document::Document, FirecrawlApp, FirecrawlError, API_VERSION};

#[derive(Deserialize, Serialize, Clone, Copy, Debug)]
pub enum ScrapeFormats {
    /// Will result in a copy of the Markdown content of the page.
    #[serde(rename = "markdown")]
    Markdown,

    /// Will result in a copy of the filtered, content-only HTML of the page.
    #[serde(rename = "html")]
    HTML,

    /// Will result in a copy of the raw HTML of the page.
    #[serde(rename = "rawHtml")]
    RawHTML,

    /// Will result in a Vec of URLs found on the page.
    #[serde(rename = "links")]
    Links,

    /// Will result in a URL to a screenshot of the page.
    /// 
    /// Can not be used in conjunction with `ScrapeFormats::ScreenshotFullPage`.
    #[serde(rename = "screenshot")]
    Screenshot,

    /// Will result in a URL to a full-page screenshot of the page.
    /// 
    /// Can not be used in conjunction with `ScrapeFormats::Screenshot`.
    #[serde(rename = "screenshot@fullPage")]
    ScreenshotFullPage,

    /// Will result in the results of an LLM extraction.
    /// 
    /// See `ScrapeOptions.extract` for more options.
    #[serde(rename = "extract")]
    Extract,
}

#[serde_with::skip_serializing_none]
#[derive(Deserialize, Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExtractOptions {
    /// Schema the output should adhere to, provided in JSON Schema format.
    pub schema: Option<Value>,

    pub system_prompt: Option<String>,

    /// Extraction prompt to send to the LLM agent along with the page content.
    pub prompt: Option<String>,
}

#[serde_with::skip_serializing_none]
#[derive(Deserialize, Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScrapeOptions {
    /// Formats to extract from the page. (default: `[ Markdown ]`)
    pub formats: Option<Vec<ScrapeFormats>>,

    /// Only extract the main content of the page, excluding navigation and other miscellaneous content. (default: `true`)
    pub only_main_content: Option<bool>,

    /// HTML tags to exclusively include.
    /// 
    /// For example, if you pass `div`, you will only get content from `<div>`s and their children.
    pub include_tags: Option<Vec<String>>,

    /// HTML tags to exclude.
    /// 
    /// For example, if you pass `img`, you will never get image URLs in your results.
    pub exclude_tags: Option<Vec<String>>,

    /// Additional HTTP headers to use when loading the page.
    pub headers: Option<HashMap<String, String>>,

    // Amount of time to wait after loading the page, and before grabbing the content, in milliseconds. (default: `0`)
    pub wait_for: Option<u32>,

    // Timeout before returning an error, in milliseconds. (default: `60000`)
    pub timeout: Option<u32>,

    /// Extraction options, to be used in conjunction with `ScrapeFormats::Extract`.
    pub extract: Option<ExtractOptions>,
}

#[derive(Deserialize, Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
struct ScrapeRequestBody {
    url: String,

    #[serde(flatten)]
    options: ScrapeOptions,
}

#[derive(Deserialize, Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
struct ScrapeResponse {
    /// This will always be `true` due to `FirecrawlApp::handle_response`.
    /// No need to expose.
    success: bool,

    /// The resulting document.
    data: Document,
}

impl FirecrawlApp {
    /// Scrapes a URL using the Firecrawl API.
    pub async fn scrape_url(
        &self,
        url: impl AsRef<str>,
        options: impl Into<Option<ScrapeOptions>>,
    ) -> Result<Document, FirecrawlError> {
        let body = ScrapeRequestBody {
            url: url.as_ref().to_string(),
            options: options.into().unwrap_or_default(),
        };

        let headers = self.prepare_headers(None);

        let response = self
            .client
            .post(&format!("{}{}/scrape", self.api_url, API_VERSION))
            .headers(headers)
            .json(&body)
            .send()
            .await
            .map_err(|e| FirecrawlError::HttpError(format!("Scraping {:?}", url.as_ref()), e))?;

        let response = self.handle_response::<ScrapeResponse>(response, "scrape URL").await?;

        Ok(response.data)
    }
}
