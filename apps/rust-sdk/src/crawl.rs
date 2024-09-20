use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::{document::Document, scrape::{ScrapeFormats, ScrapeOptions}, FirecrawlApp, FirecrawlError, API_VERSION};

#[derive(Deserialize, Serialize, Clone, Copy, Debug)]
pub enum CrawlScrapeFormats {
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
    /// Can not be used in conjunction with `CrawlScrapeFormats::ScreenshotFullPage`.
    #[serde(rename = "screenshot")]
    Screenshot,

    /// Will result in a URL to a full-page screenshot of the page.
    /// 
    /// Can not be used in conjunction with `CrawlScrapeFormats::Screenshot`.
    #[serde(rename = "screenshot@fullPage")]
    ScreenshotFullPage,
}

impl From<CrawlScrapeFormats> for ScrapeFormats {
    fn from(value: CrawlScrapeFormats) -> Self {
        match value {
            CrawlScrapeFormats::Markdown => Self::Markdown,
            CrawlScrapeFormats::HTML => Self::HTML,
            CrawlScrapeFormats::RawHTML => Self::RawHTML,
            CrawlScrapeFormats::Links => Self::Links,
            CrawlScrapeFormats::Screenshot => Self::Screenshot,
            CrawlScrapeFormats::ScreenshotFullPage => Self::ScreenshotFullPage,
        }
    }
}

#[serde_with::skip_serializing_none]
#[derive(Deserialize, Serialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CrawlScrapeOptions {
    /// Formats to extract from the page. (default: `[ Markdown ]`)
    pub formats: Option<Vec<CrawlScrapeFormats>>,

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
}

impl From<CrawlScrapeOptions> for ScrapeOptions {
    fn from(value: CrawlScrapeOptions) -> Self {
        ScrapeOptions {
            formats: value.formats.map(|formats| formats.into_iter().map(|x| x.into()).collect()),
            only_main_content: value.only_main_content,
            include_tags: value.include_tags,
            exclude_tags: value.exclude_tags,
            headers: value.headers,
            wait_for: value.wait_for,
            timeout: value.timeout,
            ..Default::default()
        }
    }
}

#[serde_with::skip_serializing_none]
#[derive(Deserialize, Serialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CrawlOptions {
    /// Options to pass through to the scraper.
    pub scrape_options: Option<CrawlScrapeOptions>,

    /// URL RegEx patterns to (exclusively) include.
    /// 
    /// For example, if you specified `"blog"`, only pages that have `blog` somewhere in the URL would be crawled.
    pub include_paths: Option<Vec<String>>,

    /// URL RegEx patterns to exclude.
    /// 
    /// For example, if you specified `"blog"`, pages that have `blog` somewhere in the URL would not be crawled.
    pub exclude_paths: Option<Vec<String>>,

    /// Maximum URL depth to crawl, relative to the base URL. (default: `2`)
    pub max_depth: Option<u32>,

    /// Tells the crawler to ignore the sitemap when crawling. (default: `true`)
    pub ignore_sitemap: Option<bool>,

    /// Maximum number of pages to crawl. (default: `10`)
    pub limit: Option<u32>,

    /// Allows the crawler to navigate links that are backwards in the URL hierarchy. (default: `false`)
    pub allow_backward_links: Option<bool>,

    /// Allows the crawler to follow links to external URLs. (default: `false`)
    pub allow_external_links: Option<bool>,

    /// URL to send Webhook crawl events to.
    pub webhook: Option<String>,

    /// Idempotency key to send to the crawl endpoint.
    #[serde(skip)]
    pub idempotency_key: Option<String>,

    /// When using `FirecrawlApp::crawl_url`, this is how often the status of the job should be checked, in milliseconds. (default: `2000`)
    #[serde(skip)]
    pub poll_interval: Option<u64>,
}

#[derive(Deserialize, Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
struct CrawlRequestBody {
    url: String,

    #[serde(flatten)]
    options: CrawlOptions,
}

#[derive(Deserialize, Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
struct CrawlResponse {
    /// This will always be `true` due to `FirecrawlApp::handle_response`.
    /// No need to expose.
    success: bool,

    /// The resulting document.
    data: Document,
}

#[derive(Deserialize, Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum CrawlStatusTypes {
    /// The crawl job is in progress.
    Scraping,

    /// The crawl job has been completed successfully.
    Completed,

    /// The crawl job has failed.
    Failed,

    /// The crawl job has been cancelled.
    Cancelled,
}

#[serde_with::skip_serializing_none]
#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CrawlStatus {
    /// The status of the crawl.
    pub status: CrawlStatusTypes,

    /// Number of pages that will be scraped in total. This number may grow as the crawler discovers new pages.
    pub total: u32,

    /// Number of pages that have been successfully scraped.
    pub completed: u32,

    /// Amount of credits used by the crawl job.
    pub credits_used: u32,

    /// Expiry time of crawl data. After this date, the crawl data will be unavailable from the API.
    pub expires_at: String, // TODO: parse into date

    /// URL to call to get the next batch of documents.
    /// Unless you are sidestepping the SDK, you do not need to deal with this.
    pub next: Option<String>,

    /// List of documents returned by the crawl
    pub data: Vec<Document>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CrawlAsyncResponse {
    success: bool,

    /// Crawl ID
    pub id: String,

    /// URL to get the status of the crawl job
    pub url: String,
}

impl FirecrawlApp {
    /// Initiates a crawl job for a URL using the Firecrawl API.
    pub async fn crawl_url_async(
        &self,
        url: impl AsRef<str>,
        options: Option<CrawlOptions>,
    ) -> Result<CrawlAsyncResponse, FirecrawlError> {
        let body = CrawlRequestBody {
            url: url.as_ref().to_string(),
            options: options.unwrap_or_default(),
        };
        
        let headers = self.prepare_headers(body.options.idempotency_key.as_ref());

        let response = self
            .client
            .post(&format!("{}{}/crawl", self.api_url, API_VERSION))
            .headers(headers.clone())
            .json(&body)
            .send()
            .await
            .map_err(|e| FirecrawlError::HttpError(format!("Crawling {:?}", url.as_ref()), e))?;

        self.handle_response::<CrawlAsyncResponse>(response, "start crawl job").await
    }

    /// Performs a crawl job for a URL using the Firecrawl API, waiting for the end result. This may take a long time depending on the size of the target page and your options (namely `CrawlOptions.limit`).
    pub async fn crawl_url(
        &self,
        url: impl AsRef<str>,
        options: impl Into<Option<CrawlOptions>>,
    ) -> Result<CrawlStatus, FirecrawlError> {
        let options = options.into();
        let poll_interval = options.as_ref().and_then(|x| x.poll_interval).unwrap_or(2000);
        let res = self.crawl_url_async(url, options).await?;

        self.monitor_job_status(&res.id, poll_interval).await
    }

    async fn check_crawl_status_next(&self, next: impl AsRef<str>) -> Result<CrawlStatus, FirecrawlError> {
        let response = self
            .client
            .get(next.as_ref())
            .headers(self.prepare_headers(None))
            .send()
            .await
            .map_err(|e| FirecrawlError::HttpError(format!("Paginating crawl using URL {:?}", next.as_ref()), e))?;

        self.handle_response(response, format!("Paginating crawl using URL {:?}", next.as_ref())).await
    }

    /// Checks for the status of a crawl, based on the crawl's ID. To be used in conjunction with `FirecrawlApp::crawl_url_async`.
    pub async fn check_crawl_status(&self, id: impl AsRef<str>) -> Result<CrawlStatus, FirecrawlError> {
        let response = self
            .client
            .get(&format!(
                "{}{}/crawl/{}",
                self.api_url, API_VERSION, id.as_ref()
            ))
            .headers(self.prepare_headers(None))
            .send()
            .await
            .map_err(|e| FirecrawlError::HttpError(format!("Checking status of crawl {}", id.as_ref()), e))?;

        let mut status: CrawlStatus = self.handle_response(response, format!("Checking status of crawl {}", id.as_ref())).await?;

        if status.status == CrawlStatusTypes::Completed {
            while let Some(next) = status.next {
                let new_status = self.check_crawl_status_next(next).await?;
                status.data.extend_from_slice(&new_status.data);
                status.next = new_status.next;
            }
        }

        Ok(status)
    }

    async fn monitor_job_status(
        &self,
        id: &str,
        poll_interval: u64,
    ) -> Result<CrawlStatus, FirecrawlError> {
        loop {
            let status_data = self.check_crawl_status(id).await?;
            match status_data.status {
                CrawlStatusTypes::Completed => {
                    break Ok(status_data);
                }
                CrawlStatusTypes::Scraping => {
                    tokio::time::sleep(tokio::time::Duration::from_millis(poll_interval)).await;
                }
                CrawlStatusTypes::Failed => {
                    break Err(FirecrawlError::CrawlJobFailed(format!(
                        "Crawl job failed."
                    ), status_data));
                }
                CrawlStatusTypes::Cancelled => {
                    break Err(FirecrawlError::CrawlJobFailed(format!(
                        "Crawl job was cancelled."
                    ), status_data));
                }
            }
        }
    }
}
