export function parseMode(mode: string) {
  switch (mode) {
    case "single_urls":
      return "single_urls";
    case "sitemap":
      return "sitemap";
    case "crawl":
      return "crawl";
    default:
      return "single_urls";
  }
}
