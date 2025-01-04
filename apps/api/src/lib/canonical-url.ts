export function normalizeUrl(url: string) {
  url = url.replace(/^https?:\/\//, "").replace(/^www\./, "");
  if (url.endsWith("/")) {
    url = url.slice(0, -1);
  }
  return url;
}