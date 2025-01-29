import { deduplicateRecords } from "../../ranker";
import { deduplicateObjectsArray } from "./deduplicate-objs-array";
import { mergeNullValObjs } from "./merge-null-val-objs";
import { Logger } from "winston";

/**
 * Deduplicates multi-entity results using a combination of techniques:
 * 1. First uses basic object deduplication to remove exact duplicates
 * 2. Then uses embedding-based deduplication for semantic duplicates
 * 3. Finally merges similar objects with null values
 */
export async function deduplicateMultiEntityResults(
  results: { [key: string]: any[] } | any[],
  logger?: Logger
): Promise<{ [key: string]: any[] } | any[]> {
  try {
    // If input is an array, process it directly
    if (Array.isArray(results)) {
      // Step 1: Remove exact duplicates by wrapping in an object
      const wrapped = { items: results };
      const deduped = deduplicateObjectsArray(wrapped);
      const uniqueResults = deduped.items;
      
      // Step 2: Use embedding-based deduplication for semantic duplicates
      const deduplicatedResults = await deduplicateRecords(uniqueResults, 0.7, 0.85);
      
      // Step 3: Merge similar objects with null values
      // Wrap array in object for mergeNullValObjs
      const mergedResults = mergeNullValObjs({ items: deduplicatedResults });
      return mergedResults.items;
    }
    
    // If input is an object with arrays, process each array
    const deduplicatedResults: { [key: string]: any[] } = {};
    
    for (const key in results) {
      if (Array.isArray(results[key])) {
        // Step 1: Remove exact duplicates
        const wrapped = { [key]: results[key] };
        const deduped = deduplicateObjectsArray(wrapped);
        const uniqueResults = deduped[key];
        
        // Step 2: Use embedding-based deduplication for semantic duplicates
        const deduplicatedArray = await deduplicateRecords(uniqueResults, 0.7, 0.85);
        
        // Step 3: Merge similar objects with null values
        const mergedResults = mergeNullValObjs({ [key]: deduplicatedArray });
        deduplicatedResults[key] = mergedResults[key];
      } else {
        // If not an array, keep as is
        deduplicatedResults[key] = results[key];
      }
    }
    
    return deduplicatedResults;
  } catch (error) {
    logger?.error("Error in deduplicateMultiEntityResults", { error });
    // On error, return original results
    return results;
  }
} 