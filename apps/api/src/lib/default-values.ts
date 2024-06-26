export const defaultOrigin = "api";

export const defaultTimeout = 30000; // 30 seconds

export const defaultPageOptions = {
  onlyMainContent: false,
  includeHtml: false,
  waitFor: 0,
  screenshot: false,
  parsePDF: true
};

export const defaultCrawlerOptions = {
  allowBackwardCrawling: false
}

export const defaultCrawlPageOptions = {
  onlyMainContent: false,
  includeHtml: false,
  removeTags: [],
  parsePDF: true
}

export const defaultExtractorOptions = {
  mode: "markdown"
}