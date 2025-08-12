/**
 * E2E tests for v2 scrape
 */
import Firecrawl from "../../../index";
import { z } from "zod";
import { config } from "dotenv";
import { describe, test, expect } from "@jest/globals";

config();

const API_KEY = process.env.FIRECRAWL_API_KEY ?? "";
const API_URL = process.env.FIRECRAWL_API_URL ?? "https://api.firecrawl.dev";

describe("v2.scrape e2e", () => {
  if (!API_KEY) {
    console.warn("Skipping v2.scrape e2e: FIRECRAWL_API_KEY not set");
  }

  const client = new Firecrawl({ apiKey: API_KEY, apiUrl: API_URL })

  const assertValidDocument = (doc: any) => {
    expect(doc).toBeTruthy();
    const hasContent = Boolean(doc.markdown?.length) || Boolean(doc.html?.length) || Boolean(doc.rawHtml?.length);
    expect(hasContent).toBe(true);
    expect(doc.metadata).toBeTruthy();
  };

  test("minimal: scrape only required params", async () => {
    if (!client) throw new Error();
    const doc = await client.scrape("https://docs.firecrawl.dev");
    assertValidDocument(doc);
  }, 60_000);

  test("maximal: scrape with all options", async () => {
    if (!client) throw new Error();
    const doc = await client.scrape("https://docs.firecrawl.dev", {
      formats: [
        "markdown",
        "html",
        "rawHtml",
        "links",
        { type: "screenshot", fullPage: true, quality: 80, viewport: { width: 1280, height: 800 } },
        {
          type: "json",
          prompt: "Summarize the page and list links",
          schema: {
            type: "object",
            properties: {
              summary: { type: "string" },
              links: { type: "array", items: { type: "string", format: "uri" } },
            },
            required: ["summary"],
          },
        },
      ],
      parsers: ["pdf"],
      headers: { "User-Agent": "firecrawl-tests" },
      includeTags: ["article"],
      excludeTags: ["nav"],
      onlyMainContent: true,
      waitFor: 1000,
      timeout: 30_000,
      location: { country: "us", languages: ["en"] },
      mobile: false,
      skipTlsVerification: false,
      removeBase64Images: true,
      blockAds: true,
      proxy: "auto",
      storeInCache: true,
      maxAge: 60_000,
    });
    assertValidDocument(doc);
  }, 90_000);

  test("json format with zod schema (auto-converted internally)", async () => {
    if (!client) throw new Error();
    const zodSchema = z.object({
      title: z.string().min(1),
      items: z.array(z.string().url()).optional(),
    });

    const doc = await client.scrape("https://docs.firecrawl.dev", {
      formats: [
        {
          type: "json",
          prompt: "Extract title and items",
          schema: zodSchema,
        },
      ],
    });
    expect(doc).toBeTruthy();
  }, 90_000);

  test.each([
    ["markdown", "markdown"],
    ["html", "html"],
    ["rawHtml", "rawHtml"],
    ["links", "links"],
    ["screenshot", "screenshot"],
  ])("basic format: %s", async (fmt, expectField) => {
    if (!client) throw new Error();
    const doc = await client.scrape("https://docs.firecrawl.dev", { formats: [fmt as any] });
    if (expectField !== "links" && expectField !== "screenshot") {
      assertValidDocument(doc);
    }
    if (expectField === "markdown") expect(doc.markdown).toBeTruthy();
    if (expectField === "html") expect(doc.html).toBeTruthy();
    if (expectField === "rawHtml") expect(doc.rawHtml).toBeTruthy();
    if (expectField === "screenshot") expect(doc.screenshot).toBeTruthy();
    if (expectField === "links") {
      expect(Array.isArray(doc.links)).toBe(true);
      expect((doc.links || []).length).toBeGreaterThan(0);
    }
  }, 90_000);

  test("invalid url should throw", async () => {
    if (!client) throw new Error();
    await expect(client.scrape("")).rejects.toThrow("URL cannot be empty");
    await expect(client.scrape("   ")).rejects.toThrow("URL cannot be empty");
  });
});

