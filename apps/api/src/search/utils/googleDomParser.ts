import cheerio from "cheerio";
import { SearchResult } from "../../lib/entities";

export function parseGoogleSearchResults(html: string): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  $("div.g").each((_index, element) => {
    const link = $(element).find("a").attr("href");
    const title = $(element).find("h3").text();
    const description = $(element)
      .find("div[style='-webkit-line-clamp:2']")
      .text();

    if (link && title && description) {
      results.push(new SearchResult(link, title, description));
    }
  });

  // Extract additional information (e.g., knowledge graph or answer box)
  const answerBox = $(".mod").text();
  if (answerBox) {
    results.push(new SearchResult("", "Answer Box", answerBox));
  }

  return results;
}
