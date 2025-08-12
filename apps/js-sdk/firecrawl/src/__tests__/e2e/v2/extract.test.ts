/**
 * E2E tests for v2 extract (proxied to v1), translated from Python tests
 */
import Firecrawl from "../../../index";
import { config } from "dotenv";
import { describe, test, expect } from "@jest/globals";
import { z } from "zod";

config();

const API_KEY = process.env.FIRECRAWL_API_KEY ?? "";
const API_URL = process.env.FIRECRAWL_API_URL ?? "https://api.firecrawl.dev";

const client = new Firecrawl({ apiKey: API_KEY, apiUrl: API_URL });

describe("v2.extract e2e", () => {
  test("extract minimal with prompt", async () => {
    const resp = await client.extract({ urls: ["https://docs.firecrawl.dev"], prompt: "Extract the main page title" });
    expect(typeof resp.success === "boolean" || resp.success == null).toBe(true);
  }, 120_000);

  test("extract with schema", async () => {
    const schema = {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
    } as const;
    const resp = await client.extract({
      urls: ["https://docs.firecrawl.dev"],
      schema,
      prompt: "Extract the main page title",
      showSources: true,
      enableWebSearch: false,
    });
    expect(typeof resp.success === "boolean" || resp.success == null).toBe(true);
    if ((resp as any).sources != null) {
      expect(typeof (resp as any).sources).toBe("object");
    }
    if (resp.data != null) {
      expect(typeof resp.data).toBe("object");
      expect((resp.data as any).title).toBeTruthy();
    }
  }, 180_000);

  test("extract with zod schema", async () => {
    const schema = z.object({
      title: z.string(),
    });
    const resp = await client.extract({
      urls: ["https://docs.firecrawl.dev"],
      schema: schema,
      prompt: "Extract the main page title",
      showSources: true,
      enableWebSearch: false,
    });
    expect(typeof resp.success === "boolean" || resp.success == null).toBe(true);
    if ((resp as any).sources != null) {
      expect(typeof (resp as any).sources).toBe("object");
    }
    if (resp.data != null) {
      expect(typeof resp.data).toBe("object");
      expect(schema.safeParse(resp.data).success).toBe(true);
    }
  }, 180_000);
});

