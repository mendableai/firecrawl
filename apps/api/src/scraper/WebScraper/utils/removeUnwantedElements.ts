import cheerio, { AnyNode, Cheerio } from "cheerio";
import { PageOptions } from "../../../lib/entities";
import { excludeNonMainTags } from "./excludeTags";

export const removeUnwantedElements = (html: string, pageOptions: PageOptions) => {
  const soup = cheerio.load(html);
  soup("script, style, iframe, noscript, meta, head").remove();
  
  if (pageOptions.removeTags) {
    if (typeof pageOptions.removeTags === 'string') {
      pageOptions.removeTags = [pageOptions.removeTags];
    }
  
    if (Array.isArray(pageOptions.removeTags)) {
      pageOptions.removeTags.forEach((tag) => {
        let elementsToRemove: Cheerio<AnyNode>;
        if (tag.startsWith("*") && tag.endsWith("*")) {
          const regexPattern = new RegExp(`\\b${tag.slice(1, -1)}\\b`);
          elementsToRemove = soup('*').filter((index, element) => {
            const classNames = soup(element).attr('class');
            return classNames && classNames.split(/\s+/).some(className => regexPattern.test(className));
          });
        } else {
          elementsToRemove = soup(tag);
        }
  
        elementsToRemove.remove();
      });
    }
  }
  
  if (pageOptions.onlyMainContent) {
    // remove any other tags that are not in the main content
    excludeNonMainTags.forEach((tag) => {
      const elementsToRemove = soup(tag);
      elementsToRemove.remove();
    });
  }
  const cleanedHtml = soup.html();
  return cleanedHtml;
};