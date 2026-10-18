import { describe, expect, vi, test } from "vitest";
import { search } from "../../../v2/methods/search";

function httpMock() {
  return {
    post: vi.fn(async () => ({ status: 200, data: { success: true } })),
  } as any;
}

describe("v2 search restrictions", () => {
  test("forwards cr and lr", async () => {
    const http = httpMock();

    await search(http, { query: "firecrawl", cr: "countryGR", lr: "lang_el" });

    expect(http.post).toHaveBeenCalledWith(
      "/v2/search",
      { query: "firecrawl", cr: "countryGR", lr: "lang_el" },
      {},
    );
  });

  test("omits cr and lr when the caller does not set them", async () => {
    const http = httpMock();

    await search(http, { query: "firecrawl" });

    const payload = http.post.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("cr");
    expect(payload).not.toHaveProperty("lr");
  });
});
