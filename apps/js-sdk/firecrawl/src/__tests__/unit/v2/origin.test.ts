import { afterEach, describe, test, expect } from "vitest";
import type { AxiosAdapter } from "axios";
import { FirecrawlClient } from "../../../v2/client";
import { Firecrawl } from "../../../index";
import { getVersion } from "../../../v2/utils/getVersion";

function withCapture<T extends { http: any }>(client: T) {
  const bodies: Array<Record<string, unknown>> = [];
  const adapter: AxiosAdapter = async config => {
    bodies.push(JSON.parse(config.data));
    return {
      data: { success: true, data: { markdown: "# hello" } },
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    };
  };
  client.http.instance.defaults.adapter = adapter;
  return { client, bodies };
}

describe("v2 request origin", () => {
  afterEach(() => {
    delete process.env.FIRECRAWL_DISABLE_CALLER_ORIGIN;
  });

  test("defaults to the plain SDK origin when application code creates the client", async () => {
    const { client, bodies } = withCapture(new FirecrawlClient({ apiKey: "fc-test" }));
    await client.scrape("https://example.com");
    expect(bodies[0]!.origin).toBe(`js-sdk@${getVersion()}`);
  });

  test("the origin client option is stamped into request bodies", async () => {
    const { client, bodies } = withCapture(
      new FirecrawlClient({ apiKey: "fc-test", origin: "js-sdk.example@1.0.0" }),
    );
    await client.scrape("https://example.com");
    expect(bodies[0]!.origin).toBe("js-sdk.example@1.0.0");
  });

  test("a per-call origin wins over the client origin", async () => {
    const { client, bodies } = withCapture(
      new FirecrawlClient({ apiKey: "fc-test", origin: "js-sdk.example@1.0.0" }),
    );
    await client.scrape("https://example.com", { origin: "per-call" } as any);
    await client.scrape("https://example.com", { origin: "mcp-server" } as any);
    expect(bodies.map(b => b.origin)).toEqual(["per-call", "mcp-server"]);
  });

  test("the unified client forwards the origin option to v1", () => {
    const app = new Firecrawl({ apiKey: "fc-test", origin: "js-sdk.example@1.0.0" });
    expect((app.v1 as any).clientOrigin).toBe("js-sdk.example@1.0.0");
  });

  test("FIRECRAWL_DISABLE_CALLER_ORIGIN keeps the plain default", () => {
    process.env.FIRECRAWL_DISABLE_CALLER_ORIGIN = "1";
    const client = new FirecrawlClient({ apiKey: "fc-test" });
    expect((client as any).http.getOrigin()).toBe(`js-sdk@${getVersion()}`);
  });
});
