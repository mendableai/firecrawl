import { Document } from "../../../controllers/v2/types";
import { Meta } from "..";
import { extractDataAttributes } from "../lib/extractDataAttributes";

/**
 * Transformer to extract data-* attributes from HTML
 */
export async function deriveDataAttributesFromHTML(
  meta: Meta,
  document: Document,
): Promise<Document> {
  if (document.html === undefined) {
    throw new Error(
      "html is undefined -- this transformer is being called out of order",
    );
  }

  // Only extract if data attribute extraction is configured
  if (meta.options.extractDataAttributes && meta.options.extractDataAttributes.length > 0) {
    try {
      const dataAttributes = await extractDataAttributes(document.html, meta.options);
      
      if (dataAttributes.length > 0) {
        document.dataAttributes = dataAttributes;
        
        meta.logger.debug("Extracted data attributes", {
          count: dataAttributes.length,
          attributes: dataAttributes.map(d => ({
            selector: d.selector,
            attribute: d.attribute,
            valuesCount: d.values.length
          }))
        });
      }
    } catch (error) {
      meta.logger.error("Failed to extract data attributes", {
        error,
        url: meta.url
      });
    }
  }

  return document;
}
