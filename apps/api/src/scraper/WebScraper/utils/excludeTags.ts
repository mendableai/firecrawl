/**
 * Reduces unnessary content (elements) from the HTML to make it more readable for
 * analysis and AI.
 *
 */

import * as cheerio from "cheerio";

/**
 * Removes unnecessary content from the given HTML string
 * @param {string} htmlString
 * @returns {string} html
 */
export const excludeNonMainTags = (htmlString: string): string => {
  const $ = cheerio.load(htmlString);

  // Find the main element by priority, with fallback to body
  let mainElement = 
  $("main").first().length ? $("main").first() :
  $('[role="main"]').first().length ? $('[role="main"]').first() :
  $('[role="main-content"]').first().length ? $('[role="main-content"]').first() :
  $("body").first();

  const tagsAndClassesToRemove = [
    "script",
    "style",
    "footer",
    "header",
    "nav",
    "aside",
    "iframe",
    "noscript",
    "input",
    "select",
    "textarea",
    "button",
    "form",
    ".filter",
    ".filters",
    ".ad",
    ".ads",
    ".advertisement",
    ".breadcrumb",
    ".widget",
    ".modal",
    ".popup",
    ".tooltip",
    ".masthead",
    ".subscribe",
    ".newsletter",
    ".social-share",
    ".social-icons",
  ];

  // Remove elements by tag and class
  tagsAndClassesToRemove.forEach((tag) => {
    mainElement.find(tag).remove();
  });

  const attributesToKeepForFilterRemoval = ["label", "href"]; // also consider data-* see below
  // Remove elements with any attribute containing 'filter' (excluding certain attributes and file paths)
  mainElement.find("*").each((index, el) => {
    const attributes = el.attribs;

    for (let attrName in attributes) {
      const attrValue = attributes[attrName];

      // Exclude certain attributes and check if the attribute value is not a file path
      if (
        !attributesToKeepForFilterRemoval.includes(attrName) &&
        attrValue.includes("filter") &&
        !attrValue.includes("/") // this is to keep data links that aren't <a href=... as could be useful
      ) {
        $(el).remove();
        break;
      }
    }
  });

  return $.html(mainElement);
};
