/**
 * E2E tests for v2 scrape
 */
import Firecrawl from "../../../index";
import { z } from "zod";
import { config } from "dotenv";
import { getIdentity, getApiUrl } from "./utils/idmux";
import { describe, test, expect, beforeAll } from "@jest/globals";

config();

const API_URL = getApiUrl();
let client: Firecrawl;

beforeAll(async () => {
  const { apiKey } = await getIdentity({ name: "js-e2e-scrape" });
  client = new Firecrawl({ apiKey, apiUrl: API_URL });
});

describe("v2.scrape e2e", () => {

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

  test("summary format returns summary string", async () => {
    if (!client) throw new Error();
    const doc = await client.scrape("https://firecrawl.dev", { formats: ["summary"] });
    expect(typeof doc.summary).toBe("string");
    expect((doc.summary || "").length).toBeGreaterThan(10);
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

