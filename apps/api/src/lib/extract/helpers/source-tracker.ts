import { logger } from "../../../lib/logger";
import { areMergeable } from "./merge-null-val-objs";
import { transformArrayToObject } from "./transform-array-to-obj";

interface TransformedResult {
  transformed: { [key: string]: any[] };
  url: string;
}

/**
 * Tracks sources through the transformation, deduplication, and merging process
 */
export class SourceTracker {
  private transformedResults: TransformedResult[];
  private preDedupeSourceMap: Map<string, string[]>;

  constructor() {
    this.transformedResults = [];
    this.preDedupeSourceMap = new Map();
  }

  /**
   * Transform raw extraction results into a format that preserves source information
   */
  transformResults(extractionResults: { extract: any; url: string }[], schema: any, withTransform: boolean = true) {
    // First transform each result individually
    this.transformedResults = extractionResults.map(result => ({
      transformed: transformArrayToObject(schema, [result.extract]),
      url: result.url
    }));
    if (withTransform) {
    // Then combine all extracts and transform them together to match original behavior
    const combinedExtracts = extractionResults.map(r => r.extract);
    return transformArrayToObject(schema, combinedExtracts);
    }
    return this.transformedResults;
  }

  /**
   * Merge all transformed results into one object - this is now only used internally
   */
  private mergeTransformedResults() {
    return this.transformedResults.reduce((acc, curr) => {
      Object.keys(curr.transformed).forEach(key => {
        const value = curr.transformed[key];
        if (!acc[key]) {
          acc[key] = Array.isArray(value) ? [...value] : value;
        } else if (Array.isArray(acc[key]) && Array.isArray(value)) {
          acc[key].push(...value);
        } else if (typeof acc[key] === 'object' && typeof value === 'object') {
          acc[key] = { ...acc[key], ...value };
        }
      });
      return acc;
    }, {} as { [key: string]: any[] });
  }

  /**
   * Track sources for each item before deduplication
   */
  trackPreDeduplicationSources(multiEntityResult: { [key: string]: any[] }) {
    try {
    Object.keys(multiEntityResult).forEach(key => {
      multiEntityResult[key].forEach((item: any) => {
        const itemKey = JSON.stringify(item);
        const matchingSources = this.transformedResults
          .filter(result => 
            result.transformed[key]?.some((resultItem: any) => 
              JSON.stringify(resultItem) === itemKey
            )
          )
          .map(result => result.url);
        this.preDedupeSourceMap.set(itemKey, matchingSources);
      });
    });
    } catch (error) {
      logger.error(`Failed to track pre-deduplication sources`, { error });
    }
  }

  /**
   * Map sources to final deduplicated/merged items
   */
  mapSourcesToFinalItems(
    multiEntityResult: { [key: string]: any[] },
    multiEntityKeys: string[]
  ): Record<string, string[]> {
    try {
    const sources: Record<string, string[]> = {};

    multiEntityKeys.forEach(key => {
      if (multiEntityResult[key] && Array.isArray(multiEntityResult[key])) {
        multiEntityResult[key].forEach((item: any, finalIndex: number) => {
          const sourceKey = `${key}[${finalIndex}]`;
          const itemSources = new Set<string>();

          this.transformedResults.forEach(result => {
            result.transformed[key]?.forEach((originalItem: any) => {
              if (areMergeable(item, originalItem)) {
                itemSources.add(result.url);
              }
            });
          });

          sources[sourceKey] = Array.from(itemSources);
        });
      }
    });

    return sources;
  } catch (error) {
    logger.error(`Failed to map sources to final items`, { error });
    return {};
  }
}    
} 