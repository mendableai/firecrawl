// crawler.test.ts
import { WebCrawler } from "../crawler";
import axios from "axios";
import robotsParser from "robots-parser";

jest.mock("axios");
jest.mock("robots-parser");

describe("WebCrawler", () => {
  let crawler: WebCrawler;
  const mockAxios = axios as jest.Mocked<typeof axios>;
  const mockRobotsParser = robotsParser as jest.MockedFunction<
    typeof robotsParser
  >;

  beforeEach(() => {
    // Setup default mocks
    mockAxios.get.mockImplementation((url) => {
      if (url.includes("robots.txt")) {
        return Promise.resolve({ data: "User-agent: *\nAllow: /" });
      } else if (url.includes("sitemap.xml")) {
        return Promise.resolve({ data: "sitemap content" }); // You would normally parse this to URLs
      }
      return Promise.resolve({ data: "<html></html>" });
    });

    mockRobotsParser.mockReturnValue({
      isAllowed: jest.fn().mockReturnValue(true),
      isDisallowed: jest.fn().mockReturnValue(false),
      getMatchingLineNumber: jest.fn().mockReturnValue(0),
      getCrawlDelay: jest.fn().mockReturnValue(0),
      getSitemaps: jest.fn().mockReturnValue([]),
      getPreferredHost: jest.fn().mockReturnValue("example.com"),
    });
  });

  it("should ignore social media and email links", async () => {
    const urlsWhichShouldGetBlocked = [
      "http://facebook.com",
      "http://www.facebook.com",
      "https://facebook.com",
      "https://test.facebook.com",
      "https://en.wikipedia.com/barman",
      "https://docs.mux.com/guides/player",
      "https://mux.com",
      "https://x.com",
    ];

    crawler = new WebCrawler({
      jobId: "TEST",
      initialUrl: "http://example.com",
      includes: [],
      excludes: [],
      limit: 100,
      maxCrawledDepth: 10,
      crawlId: "TEST",
    });

    const filteredLinks = urlsWhichShouldGetBlocked.filter(
      (url) => !crawler.isSocialMediaOrEmail(url),
    );

    expect(filteredLinks).toContain("https://docs.mux.com/guides/player");
    expect(filteredLinks.length).toBe(2);
  });
});
