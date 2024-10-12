export const defaultOrigin = "api";

export const defaultTimeout = 60000; // 60 seconds

export const defaultPageOptions = {
  includeHtml: false,
  waitFor: 0,
  screenshot: false,
  fullPageScreenshot: false,
  parsePDF: true
};

export const defaultCrawlerOptions = {
  limit: 10000
}

export const defaultCrawlPageOptions = {
  includeHtml: false,
  removeTags: [],
  parsePDF: true
}

export const defaultExtractorOptions = {
  mode: "markdown"
}