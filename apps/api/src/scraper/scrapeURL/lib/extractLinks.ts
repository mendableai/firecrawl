// TODO: refactor
import { load } from "cheerio";

export function extractLinks(html: string, baseUrl: string): string[] {
    const $ = load(html);
    const links: string[] = [];
  
    $('a').each((_, element) => {
        const href = $(element).attr('href');
        if (href) {
            if (href.startsWith('http://') || href.startsWith('https://')) {
                // Absolute URL, add as is
                links.push(href);
            } else if (href.startsWith('/')) {
                // Relative URL starting with '/', append to origin
                links.push(new URL(href, baseUrl).href);
            } else if (!href.startsWith('#') && !href.startsWith('mailto:')) {
                // Relative URL not starting with '/', append to base URL
                links.push(new URL(href, baseUrl).href);
            } else if (href.startsWith('mailto:')) {
                // mailto: links, add as is
                links.push(href);
            }
            // Fragment-only links (#) are ignored
        }
    });
  
    // Remove duplicates and return
    return [...new Set(links)];
}