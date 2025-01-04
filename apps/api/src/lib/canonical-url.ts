export function normalizeUrl(url: string) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "");
  } catch (error) {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split('/')[0];
  }
}