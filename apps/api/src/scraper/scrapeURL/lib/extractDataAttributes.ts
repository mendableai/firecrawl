import { load } from "cheerio";
import { ScrapeOptions } from "../../../controllers/v2/types";
import { logger } from "../../../lib/logger";

export type DataAttributeResult = {
  selector: string;
  attribute: string;
  values: string[];
};

/**
 * Extracts data-* attributes from HTML based on the provided selectors and attribute names
 * @param html - The HTML content to extract from
 * @param scrapeOptions - The scrape options containing extractDataAttributes configuration
 * @returns Array of extracted data attribute results
 */
export async function extractDataAttributes(
  html: string,
  scrapeOptions: ScrapeOptions
): Promise<DataAttributeResult[]> {
  if (!scrapeOptions.extractDataAttributes || scrapeOptions.extractDataAttributes.length === 0) {
    return [];
  }

  const results: DataAttributeResult[] = [];

  try {
    const $ = load(html);

    for (const extraction of scrapeOptions.extractDataAttributes) {
      const { selector, attribute } = extraction;
      const values: string[] = [];

      // Find all elements matching the selector
      $(selector).each((_, element) => {
        // Get the attribute value
        // Support both data-* format and without data- prefix
        let attrValue = $(element).attr(attribute);
        
        // If not found and attribute doesn't start with 'data-', try with 'data-' prefix
        if (!attrValue && !attribute.startsWith('data-')) {
          attrValue = $(element).attr(`data-${attribute}`);
        }

        if (attrValue) {
          values.push(attrValue);
        }
      });

      results.push({
        selector,
        attribute,
        values
      });

      logger.debug("Data attribute extraction", {
        selector,
        attribute,
        valuesCount: values.length,
        sample: values.slice(0, 3)
      });
    }
  } catch (error) {
    logger.error("Failed to extract data attributes", {
      error,
      module: "scrapeURL",
      method: "extractDataAttributes"
    });
  }

  return results;
}
