import { Document } from "../../../controllers/v1/types";
import { Meta } from "..";
import { CacheEntry, cacheKey, saveEntryToCache } from "../../../lib/cache";

export function saveToCache(meta: Meta, document: Document): Document {
  if (meta.internalOptions.useCache !== true) {
    return document;
  }

  if (
    document.metadata.statusCode! < 200 ||
    document.metadata.statusCode! >= 300
  )
    return document;

  if (document.rawHtml === undefined) {
    throw new Error(
      "rawHtml is undefined -- this transformer is being called out of order",
    );
  }

  // If the document was retrieved from cache, we don't need to save it
  if (meta.internalOptions.fromCache) {
    return document;
  }

  const key = cacheKey(meta.url, meta.options, meta.internalOptions);

  if (key !== null) {
    const entry: CacheEntry = {
      html: document.rawHtml!,
      statusCode: document.metadata.statusCode!,
      url: document.metadata.url ?? document.metadata.sourceURL!,
      error: document.metadata.error ?? undefined,
    };

    saveEntryToCache(key, entry);
  }

  return document;
}
