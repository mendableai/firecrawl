/**
 * E2E tests for v2 usage endpoints (translated from Python tests)
 */
import Firecrawl from "../../../index";
import { config } from "dotenv";
import { describe, test, expect } from "@jest/globals";

config();

const API_KEY = process.env.FIRECRAWL_API_KEY ?? "";
const API_URL = process.env.FIRECRAWL_API_URL ?? "https://api.firecrawl.dev";

const client = new Firecrawl({ apiKey: API_KEY, apiUrl: API_URL });

describe("v2.usage e2e", () => {
  test("get_concurrency", async () => {
    const resp = await client.getConcurrency();
    expect(typeof resp.concurrency).toBe("number");
    expect(typeof resp.maxConcurrency).toBe("number");
  }, 60_000);

  test("get_credit_usage", async () => {
    const resp = await client.getCreditUsage();
    expect(typeof resp.remaining_credits).toBe("number");
  }, 60_000);

  test("get_token_usage", async () => {
    const resp = await client.getTokenUsage();
    expect(typeof resp.remainingTokens).toBe("number");
  }, 60_000);
});

