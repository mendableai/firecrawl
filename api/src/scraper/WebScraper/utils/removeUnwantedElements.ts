import cheerio, { AnyNode, Cheerio } from "cheerio";
import { PageOptions } from "../../../lib/entities";
import { excludeNonMainTags } from "./excludeTags";

export const removeUnwantedElements = (
  html: string,
  pageOptions: PageOptions
) => {
  const soup = cheerio.load(html);

  if (
    pageOptions.onlyIncludeTags &&
    pageOptions.onlyIncludeTags.length > 0 &&
    pageOptions.onlyIncludeTags[0] !== ''
  ) {
    if (typeof pageOptions.onlyIncludeTags === "string") {
      pageOptions.onlyIncludeTags = [pageOptions.onlyIncludeTags];
    }
    if (pageOptions.onlyIncludeTags.length !== 0) {
      // Create a new root element to hold the tags to keep
      const newRoot = cheerio.load("<div></div>")("div");
      pageOptions.onlyIncludeTags.forEach((tag) => {
        soup(tag).each((index, element) => {
          newRoot.append(soup(element).clone());
        });
      });
      return newRoot.html();
    }
  }

  soup("script, style, iframe, noscript, meta, head").remove();

  if (
    pageOptions.removeTags &&
    pageOptions.removeTags.length > 0 &&
    pageOptions.removeTags[0] !== ''
  ) {
    if (typeof pageOptions.removeTags === "string") {
      pageOptions.removeTags = [pageOptions.removeTags];
    }

    if (Array.isArray(pageOptions.removeTags)) {
      pageOptions.removeTags.forEach((tag) => {
        let elementsToRemove: Cheerio<AnyNode>;
        if (tag.startsWith("*") && tag.endsWith("*")) {
          let classMatch = false;

          const regexPattern = new RegExp(tag.slice(1, -1), "i");
          elementsToRemove = soup("*").filter((i, element) => {
            if (element.type === "tag") {
              const attributes = element.attribs;
              const tagNameMatches = regexPattern.test(element.name);
              const attributesMatch = Object.keys(attributes).some((attr) =>
                regexPattern.test(`${attr}="${attributes[attr]}"`)
              );
              if (tag.startsWith("*.")) {
                classMatch = Object.keys(attributes).some((attr) =>
                  regexPattern.test(`class="${attributes[attr]}"`)
                );
              }
              return tagNameMatches || attributesMatch || classMatch;
            }
            return false;
          });
        } else {
          elementsToRemove = soup(tag);
        }
        elementsToRemove.remove();
      });
    }
  }

  if (pageOptions.onlyMainContent) {
    excludeNonMainTags.forEach((tag) => {
      const elementsToRemove = soup(tag);
      elementsToRemove.remove();
    });
  }
  const cleanedHtml = soup.html();
  return cleanedHtml;
};
