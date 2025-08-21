import { load } from "cheerio";
import { logger } from "../../../lib/logger";

export type AttributeResult = {
  selector: string;
  attribute: string;
  values: string[];
};

export type AttributeSelector = {
  selector: string;
  attribute: string;
};

/**
 * Extracts attributes from HTML based on the provided selectors and attribute names
 * @param html - The HTML content to extract from
 * @param selectors - Array of selector/attribute pairs to extract
 * @returns Array of extracted attribute results
 */
export async function extractAttributes(
  html: string,
  selectors: AttributeSelector[]
): Promise<AttributeResult[]> {
  if (!selectors || selectors.length === 0) {
    return [];
  }

  const results: AttributeResult[] = [];

  try {
    const $ = load(html);

    for (const extraction of selectors) {
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

      logger.debug("Attribute extraction", {
        selector,
        attribute,
        valuesCount: values.length,
        sample: values.slice(0, 3)
      });
    }
  } catch (error) {
    logger.error("Failed to extract attributes", {
      error,
      module: "scrapeURL",
      method: "extractAttributes"
    });
  }

  return results;
}
