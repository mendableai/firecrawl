import { Document } from "../../../controllers/v1/types";
import { supabase_service } from "../../../services/supabase";
import { normalizeUrl } from "../../../lib/canonical-url";

export async function getCachedDocs(urls: string[], cacheKey: string): Promise<Document[]> {
  const normalizedUrls = urls.map(normalizeUrl);
  const { data, error } = await supabase_service
    .from('cached_scrapes')
    .select('doc')
    .in('url', normalizedUrls)
    .eq('cache_key', cacheKey);

  if (error) {
    console.error('Error fetching cached docs:', error);
    return [];
  }

  return data.map((res: any) => JSON.parse(JSON.stringify(res.doc)) as Document);
}

export async function saveCachedDocs(docs: Document[], cacheKey: string): Promise<void> {
  const { error } = await supabase_service
    .from('cached_scrapes')
    .upsert(docs.map(doc => {
      if (!doc.metadata.url) {
        throw new Error("Document has no URL");
      }
      return {
        url: normalizeUrl(doc.metadata.url),
        doc: doc,
        cache_key: cacheKey,
      }
    }));

  if (error) {
    console.error('Error saving cached docs:', error);
  }
}
