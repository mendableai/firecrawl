import { supabase_service } from "../../../services/supabase";
import { Document } from "../../../controllers/v1/types";
import { Meta } from "../index";
import { getJob } from "../../../controllers/v1/crawl-status";
import gitDiff from 'git-diff';
import parseDiff from 'parse-diff';
import { generateCompletions } from "./llmExtract";
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';



async function extractDataWithSchema(content: string, meta: Meta): Promise<any> {
    try {
        const { extract } = await generateCompletions({
            logger: meta.logger.child({
                method: "extractDataWithSchema/generateCompletions",
            }),
            options: {
                mode: "llm",
                schema: meta.options.changeTrackingOptions?.schema,
                systemPrompt: "Extract the requested information from the content based on the provided schema.",
                temperature: 0
            },
            markdown: content
        });
        return extract;
    } catch (error) {
        meta.logger.error("Error extracting data with schema", { error });
        return null;
    }
}

function compareExtractedData(previousData: any, currentData: any): any {
    const result: Record<string, { previous: any, current: any }> = {};
    
    const allKeys = new Set([
        ...Object.keys(previousData || {}),
        ...Object.keys(currentData || {})
    ]);
    
    for (const key of allKeys) {
        const oldValue = previousData?.[key];
        const newValue = currentData?.[key];
        
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            result[key] = {
                previous: oldValue,
                current: newValue
            };
        }
    }
    
    return result;
}

const CACHE_DIR = path.join(__dirname, '..', '..', '..', '..', 'data', 'scrape_cache');

const getCacheFilePath = (url: string): string => {
  const hash = crypto.createHash('sha256').update(url).digest('hex');
  return path.join(CACHE_DIR, `${hash}.json`);
};

const ensureCacheDirExists = async (): Promise<void> => {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      console.error(`Failed to create cache directory: ${CACHE_DIR}`, error);
      throw error; // Re-throw if it's not a "directory already exists" error
    }
  }
};

interface ScrapeCacheData {
  markdown: string;
  scrapedAt: string; // ISO 8601 format
}


export async function deriveDiff(meta: Meta, document: Document): Promise<Document> {
  if (meta.options.formats.includes("changeTracking")) {
    let previousMarkdown: string | null = null;
    let previousScrapeAt: string | null = null;
    let changeStatus: "new" | "same" | "changed" | "removed" = "new"; // Default

    const currentUrl = document.metadata.sourceURL ?? meta.url;
    const currentMarkdown = document.markdown ?? ""; // Ensure currentMarkdown is not null/undefined

    if (process.env.USE_DB_AUTHENTICATION === 'true') {
      try {
        const res = await supabase_service
            .rpc("diff_get_last_scrape_3", {
                i_team_id: meta.internalOptions.teamId,
                i_url: currentUrl,
            });

        const data: {
            o_job_id: string,
            o_date_added: string,
        } | undefined | null = (res.data ?? [])[0] as any;

        const job: {
            returnvalue: Document,
        } | null = data?.o_job_id ? await getJob(data.o_job_id) : null;

        if (data && job && job?.returnvalue?.markdown) {
          previousMarkdown = job.returnvalue.markdown;
          previousScrapeAt = data.o_date_added;
        } else if (res.error) {
          meta.logger.error("Error fetching previous scrape from Supabase", { error: res.error });
          document.warning = "Comparing failed (DB error)." + (document.warning ? ` ${document.warning}` : "");
          return document;
        }
      } catch (error) {
         meta.logger.error("Exception fetching previous scrape from Supabase", { error });
         document.warning = "Comparing failed (DB exception)." + (document.warning ? ` ${document.warning}` : "");
         return document;
      }
    } else {
      await ensureCacheDirExists();
      const cacheFilePath = getCacheFilePath(currentUrl);
      try {
        const fileContent = await fs.readFile(cacheFilePath, 'utf-8');
        const cacheData: ScrapeCacheData = JSON.parse(fileContent);
        previousMarkdown = cacheData.markdown;
        previousScrapeAt = cacheData.scrapedAt;
        meta.logger.info(`Found previous scrape in cache for ${currentUrl}`);
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          meta.logger.info(`No previous scrape found in cache for ${currentUrl}. Treating as new.`);
        } else {
          meta.logger.error(`Error reading cache file ${cacheFilePath}`, { error });
          document.warning = "Comparing failed (cache read error)." + (document.warning ? ` ${document.warning}` : "");
          return document;
        }
      }
    }

    if (previousMarkdown !== null) {
      const transformer = (x: string) => [...x.replace(/\s+/g, "").replace(/\[iframe\]\(.+?\)/g, "")].sort().join("");
      const isChanged = transformer(previousMarkdown) !== transformer(currentMarkdown);
      changeStatus = document.metadata.statusCode === 404 ? "removed" : isChanged ? "changed" : "same";
    } else {
      changeStatus = document.metadata.statusCode === 404 ? "removed" : "new";
    }

    document.changeTracking = {
      previousScrapeAt: previousScrapeAt,
      changeStatus,
      visibility: meta.internalOptions.urlInvisibleInCurrentCrawl ? "hidden" : "visible",
    };

    if (changeStatus === "changed" && previousMarkdown !== null) {
        if (meta.options.changeTrackingOptions?.modes?.includes("git-diff")) {
            const diffText = gitDiff(previousMarkdown, currentMarkdown, { color: false, wordDiff: false });
            if (diffText) {
                const diffStructured = parseDiff(diffText);
                document.changeTracking.diff = {
                    text: diffText,
                    json: {
                        files: diffStructured.map(file => ({
                            from: file.from || null,
                            to: file.to || null,
                            chunks: file.chunks.map(chunk => ({
                                content: chunk.content,
                                changes: chunk.changes.map(change => {
                                    const baseChange = {
                                        type: change.type,
                                        content: change.content
                                    };
                                    
                                    if (change.type === 'normal' && 'ln1' in change && 'ln2' in change) {
                                        return {
                                            ...baseChange,
                                            normal: true,
                                            ln1: change.ln1,
                                            ln2: change.ln2
                                        };
                                    } else if (change.type === 'add' && 'ln' in change) {
                                        return {
                                            ...baseChange,
                                            add: true,
                                            ln: change.ln
                                        };
                                    } else if (change.type === 'del' && 'ln' in change) {
                                        return {
                                            ...baseChange,
                                            del: true,
                                            ln: change.ln
                                        };
                                    }
                                    
                                    return baseChange;
                                })
                            }))
                        }))
                    }
                };
             }
        }
        if (meta.options.changeTrackingOptions?.modes?.includes("json")) {
             try {
                const previousData = meta.options.changeTrackingOptions.schema ?
                    await extractDataWithSchema(previousMarkdown, meta) : null;
                const currentData = meta.options.changeTrackingOptions.schema ?
                    await extractDataWithSchema(currentMarkdown, meta) : null;

                if (previousData && currentData) {
                    document.changeTracking.json = compareExtractedData(previousData, currentData);
                } else {
                   const { extract } = await generateCompletions({
                       logger: meta.logger.child({
                           method: "deriveDiff/generateCompletions",
                       }),
                       options: {
                           mode: "llm",
                           systemPrompt: "Analyze the differences between the previous and current content and provide a structured summary of the changes.",
                           schema: meta.options.changeTrackingOptions.schema,
                           prompt: meta.options.changeTrackingOptions.prompt,
                           temperature: 0
                       },
                       markdown: `Previous Content:\n${previousMarkdown}\n\nCurrent Content:\n${currentMarkdown}`,
                       previousWarning: document.warning
                   });
                   document.changeTracking.json = extract;
                }
             } catch (error) {
                meta.logger.error("Error generating structured diff with LLM", { error });
                document.warning = "Structured diff generation failed." + (document.warning ? ` ${document.warning}` : "");
             }
        }
    }

    if (process.env.USE_DB_AUTHENTICATION !== 'true' && document.metadata.statusCode !== 404) {
       const cacheFilePath = getCacheFilePath(currentUrl);
       const cacheData: ScrapeCacheData = {
         markdown: currentMarkdown,
         scrapedAt: new Date().toISOString(),
       };
       try {
         await fs.writeFile(cacheFilePath, JSON.stringify(cacheData, null, 2));
         meta.logger.info(`Wrote current scrape to cache for ${currentUrl}`);
       } catch (error) {
         meta.logger.error(`Error writing cache file ${cacheFilePath}`, { error });
       }
    }

  } // End of if (meta.options.formats.includes("changeTracking"))

  return document;
}
