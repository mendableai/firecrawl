import {
  parseVersionPin,
  pinResultVersions,
  versionPinCandidates,
} from "./version-pin";

const logger = { info: vi.fn() } as any;

describe("parseVersionPin", () => {
  it.each([
    ["Java 21 ExecutorService shutdownNow guarantees", "21", []],
    ["JDK 21 virtual threads", "21", []],
    ["Java SE 21 and java 21 records", "21", []],
    ["what changed in Java 21.", "21", []],
    ["Java 1.8 streams", "8", []],
    ["TRL v1.10.0 SFTTrainer packing", undefined, [["trl", "1.10.0"]]],
    [
      "jackson-databind 2.22.3 ObjectMapper",
      undefined,
      [["jackson-databind", "2.22.3"]],
    ],
    ["reqwest 0.13 redirect policy (2025)", undefined, [["reqwest", "0.13"]]],
    [
      "actionlint v1.7.12 usage, see #123",
      undefined,
      [["actionlint", "1.7.12"]],
    ],
    ["reqwest 0.13 changes since 01.03.2025", undefined, [["reqwest", "0.13"]]],
    [
      "tokio 1.38 with reqwest 0.13",
      undefined,
      [
        ["tokio", "1.38"],
        ["reqwest", "0.13"],
      ],
    ],
    ["Jackson 2.22.3 ObjectMapper on Java 21", "21", [["jackson", "2.22.3"]]],
  ])("%s -> %s %j", (query, jdk, versions) => {
    expect(parseVersionPin(query)).toMatchObject({ jdk, versions });
  });

  it.each([
    "how to configure redirects in reqwest",
    "Java 17 vs Java 21",
    "Java 17 vs 21",
    "migrate from Java 8 to 21",
    "changes in 2024 for issue #4512",
    "released 10.10.2024",
    "explain https://docs.rs/reqwest/0.12.5/reqwest/",
  ])("finds no single version in %s", query => {
    expect(parseVersionPin(query)).toBeNull();
  });

  it("notices questions about release assets", () => {
    expect(parseVersionPin("gojq v0.12.19 sha256 checksums")).toMatchObject({
      versions: [["gojq", "0.12.19"]],
      wantsAssets: true,
    });
    expect(parseVersionPin("gojq v0.12.19 changelog")?.wantsAssets).toBe(false);
  });
});

describe("versionPinCandidates", () => {
  const pin = (query: string) => parseVersionPin(query)!;

  it.each([
    [
      "Java 21 ExecutorService",
      "https://docs.oracle.com/javase/8/docs/api/java/util/concurrent/ExecutorService.html",
      [
        "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ExecutorService.html",
      ],
    ],
    [
      "reqwest 0.13 redirect",
      "https://docs.rs/reqwest/latest/reqwest/redirect/",
      ["https://docs.rs/reqwest/~0.13/reqwest/redirect/"],
    ],
    [
      "Jackson 2.22.3 ObjectMapper",
      "https://javadoc.io/doc/com.fasterxml.jackson.core/jackson-databind/latest/com/fasterxml/jackson/databind/ObjectMapper.html",
      [
        "https://javadoc.io/doc/com.fasterxml.jackson.core/jackson-databind/2.22.3/com/fasterxml/jackson/databind/ObjectMapper.html",
      ],
    ],
    [
      "TRL v1.10.0 SFTTrainer",
      "https://huggingface.co/docs/trl/en/sft_trainer",
      ["https://huggingface.co/docs/trl/v1.10.0/en/sft_trainer"],
    ],
    [
      "TRL v1.10.0 SFTTrainer",
      "https://huggingface.co/docs/trl/main/en/sft_trainer",
      ["https://huggingface.co/docs/trl/v1.10.0/en/sft_trainer"],
    ],
    [
      "TRL v1.10.0 SFTTrainer",
      "https://huggingface.co/docs/trl/sft_trainer",
      ["https://huggingface.co/docs/trl/v1.10.0/en/sft_trainer"],
    ],
    [
      "Jackson 2.22.3 DeserializationFeature",
      "https://javadoc.io/doc/com.fasterxml.jackson.core/jackson-databind/latest/com.fasterxml.jackson.databind/com/fasterxml/jackson/databind/DeserializationFeature.html",
      [
        "https://javadoc.io/doc/com.fasterxml.jackson.core/jackson-databind/2.22.3/com.fasterxml.jackson.databind/com/fasterxml/jackson/databind/DeserializationFeature.html",
        "https://javadoc.io/doc/com.fasterxml.jackson.core/jackson-databind/2.22.3/com/fasterxml/jackson/databind/DeserializationFeature.html",
      ],
    ],
    [
      "actionlint v1.7.12 usage",
      "https://github.com/rhysd/actionlint/blob/main/docs/usage.md",
      [
        "https://github.com/rhysd/actionlint/blob/v1.7.12/docs/usage.md",
        "https://github.com/rhysd/actionlint/blob/1.7.12/docs/usage.md",
        "https://github.com/rhysd/actionlint/blob/actionlint-1.7.12/docs/usage.md",
      ],
    ],
    [
      "actionlint v1.7.12 usage",
      "https://github.com/rhysd/actionlint/blob/v1.7.7/docs/usage.md",
      [
        "https://github.com/rhysd/actionlint/blob/v1.7.12/docs/usage.md",
        "https://github.com/rhysd/actionlint/blob/1.7.12/docs/usage.md",
        "https://github.com/rhysd/actionlint/blob/actionlint-1.7.12/docs/usage.md",
      ],
    ],
    [
      "Jackson 2.22.3 ParserBase source",
      "https://github.com/FasterXML/jackson-core/blob/2.x/src/main/java/ParserBase.java",
      [
        "https://github.com/FasterXML/jackson-core/blob/v2.22.3/src/main/java/ParserBase.java",
        "https://github.com/FasterXML/jackson-core/blob/2.22.3/src/main/java/ParserBase.java",
        "https://github.com/FasterXML/jackson-core/blob/jackson-core-2.22.3/src/main/java/ParserBase.java",
      ],
    ],
    [
      "gojq v0.12.19 release",
      "https://github.com/itchyny/gojq/releases",
      [
        "https://github.com/itchyny/gojq/releases/tag/v0.12.19",
        "https://github.com/itchyny/gojq/releases/tag/0.12.19",
        "https://github.com/itchyny/gojq/releases/tag/gojq-0.12.19",
      ],
    ],
    [
      "gojq v0.12.19 sha256 of the linux binary",
      "https://github.com/itchyny/gojq/releases/tag/v0.12.18",
      [
        "https://github.com/itchyny/gojq/releases/expanded_assets/v0.12.19",
        "https://github.com/itchyny/gojq/releases/expanded_assets/0.12.19",
        "https://github.com/itchyny/gojq/releases/expanded_assets/gojq-0.12.19",
      ],
    ],
    [
      "gojq v0.12.19 checksums",
      "https://github.com/itchyny/gojq/releases/tag/v0.12.19",
      ["https://github.com/itchyny/gojq/releases/expanded_assets/v0.12.19"],
    ],
  ])("%s: %s", (query, url, expected) => {
    expect(versionPinCandidates(url, pin(query))).toEqual(expected);
  });

  it.each([
    // A minor-only version pins a GitHub file only to the newest release.
    [
      "reqwest 0.13 redirect",
      "https://github.com/seanmonstar/reqwest/blob/master/src/redirect.rs",
    ],
    // The version belongs to another package, or the query names two.
    [
      "TRL v1.10.0 SFTTrainer",
      "https://huggingface.co/docs/accelerate/en/usage_guides/deepspeed",
    ],
    [
      "OAuth 2.0 client credentials in the Rust oauth2 crate",
      "https://docs.rs/oauth2/latest/oauth2/",
    ],
    [
      "reqwest 0.12 vs 0.13 redirect",
      "https://docs.rs/reqwest/latest/reqwest/redirect/",
    ],
    // Already on a release of the version.
    [
      "reqwest 0.13 redirect",
      "https://docs.rs/reqwest/0.13.4/reqwest/redirect/",
    ],
    // Oracle pages pin only to a JDK version.
    [
      "jackson 2.22.3",
      "https://docs.oracle.com/javase/8/docs/api/java/util/concurrent/ExecutorService.html",
    ],
    ["reqwest 0.13 redirect", "https://example.com/reqwest/latest/redirect"],
    // Already pinned.
    ["TRL v1.10.0", "https://huggingface.co/docs/trl/v1.10.0/en/sft_trainer"],
    [
      "gojq v0.12.19 changelog",
      "https://github.com/itchyny/gojq/releases/tag/v0.12.19",
    ],
  ])("%s: leaves %s", (query, url) => {
    expect(versionPinCandidates(url, pin(query))).toEqual([]);
  });
});

describe("pinResultVersions", () => {
  const result = (url: string) => ({ url, title: "Title", description: "" });

  // Answers each URL with its page, or a 404. A page's body is 4 KB unless
  // set, HEAD gives its length unless `chunked`, and `head` sets the status of
  // HEAD requests.
  function mockFetch(
    pages: Record<
      string,
      { url?: string; body?: string; chunked?: boolean; head?: number }
    >,
  ) {
    return vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const url = String(input);
        const page = pages[url];
        const isHead = init?.method === "HEAD";
        const status = !page ? 404 : isHead ? (page.head ?? 200) : 200;
        const body = page?.body ?? "x".repeat(4096);
        return {
          ok: status < 300,
          status,
          url: page?.url ?? url,
          headers: new Headers(
            page?.chunked ? {} : { "content-length": String(body.length) },
          ),
          body: isHead ? null : new Response(body).body,
        } as unknown as Response;
      });
  }
  const main = "https://github.com/rhysd/actionlint/blob/main/docs/usage.md";
  const pinnedUsage =
    "https://github.com/rhysd/actionlint/blob/v1.7.12/docs/usage.md";

  afterEach(() => vi.restoreAllMocks());

  it("rewrites to the first verified candidate and drops duplicates", async () => {
    const fetch = mockFetch({
      "https://github.com/rhysd/actionlint/blob/v1.7.12/docs/usage.md": {},
    });

    const pinned = await pinResultVersions(
      [
        result("https://github.com/rhysd/actionlint/blob/main/docs/usage.md"),
        result("https://example.com/actionlint"),
        result("https://github.com/rhysd/actionlint/blob/master/docs/usage.md"),
      ],
      "actionlint v1.7.12 usage",
      10,
      logger,
    );

    expect(pinned.map(x => x.url)).toEqual([
      "https://github.com/rhysd/actionlint/blob/v1.7.12/docs/usage.md",
      "https://example.com/actionlint",
    ]);
    expect(pinned[0].title).toBe("Title");
    expect(fetch).toHaveBeenCalledWith(
      "https://github.com/rhysd/actionlint/blob/v1.7.12/docs/usage.md",
      expect.objectContaining({ method: "HEAD" }),
    );
  });

  it("accepts a redirect to a release of the pinned version", async () => {
    mockFetch({
      "https://docs.rs/reqwest/~0.13/reqwest/redirect/index.html": {
        url: "https://docs.rs/reqwest/0.13.5/reqwest/redirect/",
        chunked: true,
      },
    });

    const pinned = await pinResultVersions(
      [result("https://docs.rs/reqwest/latest/reqwest/redirect/index.html")],
      "reqwest 0.13 redirect policy",
      10,
      logger,
    );

    expect(pinned[0].url).toBe(
      "https://docs.rs/reqwest/0.13.5/reqwest/redirect/",
    );
  });

  it("pins a GitHub file to the newest release in a minor version", async () => {
    mockFetch({
      "https://github.com/seanmonstar/reqwest/releases/latest": {
        url: "https://github.com/seanmonstar/reqwest/releases/tag/v0.13.5",
      },
      "https://github.com/seanmonstar/reqwest/blob/v0.13.5/src/redirect.rs": {},
    });
    const master =
      "https://github.com/seanmonstar/reqwest/blob/master/src/redirect.rs";

    const pinned = await pinResultVersions(
      [result(master)],
      "reqwest 0.13 redirect",
      10,
      logger,
    );
    expect(pinned[0].url).toBe(
      "https://github.com/seanmonstar/reqwest/blob/v0.13.5/src/redirect.rs",
    );
    expect(
      await pinResultVersions(
        [result(master)],
        "reqwest 0.12 redirect",
        10,
        logger,
      ),
    ).toEqual([result(master)]);
  });

  it("keeps the URL when the pinned page redirects away or is a stub", async () => {
    mockFetch({
      "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/net/http/HttpClient.html":
        { url: "https://docs.oracle.com/en/java/javase/26/" },
      "https://huggingface.co/docs/trl/v1.10.0/en/no_such_page": {
        body: "x".repeat(203),
      },
      [pinnedUsage]: { body: "Not Found", chunked: true },
    });
    const oracle =
      "https://docs.oracle.com/javase/8/docs/api/java/net/http/HttpClient.html";
    const hf = "https://huggingface.co/docs/trl/en/no_such_page";

    expect(
      await pinResultVersions(
        [result(oracle)],
        "Java 21 HttpClient",
        10,
        logger,
      ),
    ).toEqual([result(oracle)]);
    expect(
      await pinResultVersions([result(hf)], "TRL v1.10.0", 10, logger),
    ).toEqual([result(hf)]);
    expect(
      await pinResultVersions([result(main)], "actionlint v1.7.12", 10, logger),
    ).toEqual([result(main)]);
  });

  it("retries a rejected HEAD with a GET, but not a missing page", async () => {
    const fetch = mockFetch({ [pinnedUsage]: { head: 403 } });

    const pinned = await pinResultVersions(
      [result(main)],
      "actionlint v1.7.12 usage",
      10,
      logger,
    );

    expect(pinned[0].url).toBe(pinnedUsage);
    const gets = fetch.mock.calls.filter(([, init]) => init?.method === "GET");
    expect(gets.map(([url]) => url)).toEqual([pinnedUsage]);
  });

  it("pins a result that backfills a dropped duplicate", async () => {
    const config =
      "https://github.com/rhysd/actionlint/blob/main/docs/config.md";
    mockFetch({
      [pinnedUsage]: {},
      "https://github.com/rhysd/actionlint/blob/v1.7.12/docs/config.md": {},
    });

    const pinned = await pinResultVersions(
      [
        result(main),
        result("https://github.com/rhysd/actionlint/blob/master/docs/usage.md"),
        result(config),
      ],
      "actionlint v1.7.12 usage",
      2,
      logger,
    );

    expect(pinned.map(x => x.url)).toEqual([
      pinnedUsage,
      "https://github.com/rhysd/actionlint/blob/v1.7.12/docs/config.md",
    ]);
  });

  it("looks up releases only for the results it considers", async () => {
    const fetch = mockFetch({});
    const pages = Array.from({ length: 10 }, (_, index) =>
      result(`https://docs.rs/reqwest/latest/reqwest/page${index}/`),
    );

    await pinResultVersions(
      [
        ...pages,
        result(
          "https://github.com/seanmonstar/reqwest/blob/master/src/redirect.rs",
        ),
      ],
      "reqwest 0.13 redirect",
      20,
      logger,
    );

    expect(fetch).toHaveBeenCalledTimes(10);
    expect(fetch).not.toHaveBeenCalledWith(
      "https://github.com/seanmonstar/reqwest/releases/latest",
      expect.anything(),
    );
  });
});
