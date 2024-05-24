import FirecrawlApp from "@mendable/firecrawl-js";
import { z } from "zod";

async function a() {
  const app = new FirecrawlApp({
    apiKey: "fc-YOUR_API_KEY",
  });

  // Define schema to extract contents into
  const schema = z.object({
    top: z
      .array(
        z.object({
          title: z.string(),
          points: z.number(),
          by: z.string(),
          commentsURL: z.string(),
        })
      )
      .length(5)
      .describe("Top 5 stories on Hacker News"),
  });
  const scrapeResult = await app.scrapeUrl("https://firecrawl.dev", {
    extractorOptions: { extractionSchema: schema },
  });
  console.log(scrapeResult.data["llm_extraction"]);
}
a();
