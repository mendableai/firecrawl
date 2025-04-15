import { scrape } from "./lib";
import path from 'path';
import crypto from 'crypto';
import { deriveDiff } from '../../scraper/scrapeURL/transformers/diff'; // Import deriveDiff
import { Meta } from '../../scraper/scrapeURL'; // Import Meta type
import { Document } from '../../controllers/v1/types'; // Import Document type

const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockMkdir = jest.fn();
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn().mockResolvedValue(undefined), // Keep mock implementation here if simple
}));

const fsPromises = require('fs/promises');
fsPromises.readFile = mockReadFile;
fsPromises.writeFile = mockWriteFile;
fsPromises.mkdir = mockMkdir;

const mockSupabaseRpc = jest.fn(); // Keep the reference for test assertions if needed
jest.mock('../../services/supabase', () => ({
    supabase_service: {
        rpc: jest.fn(),
    },
    supabase_rr_service: {} // Mock rr service if needed
}));

const supabase = require('../../services/supabase');
supabase.supabase_service.rpc = mockSupabaseRpc;


describe("Scrape tests", () => {
  it.concurrent("mocking works properly", async () => {
    // depends on falsified mock mocking-works-properly
    // this test will fail if mock is bypassed with real data -- firecrawl.dev will never have
    // that as its actual markdown output

    const response = await scrape({
      url: "http://firecrawl.dev",
      useMock: "mocking-works-properly",
    });

    expect(response.markdown).toBe(
      "this is fake data coming from the mocking system!",
    );
  }, 30000);

  it.concurrent("works", async () => {
    const response = await scrape({
      url: "http://firecrawl.dev"
    });

    expect(response.markdown).toContain("Firecrawl");
  }, 30000);

  it.concurrent("handles non-UTF-8 encodings", async () => {
    const response = await scrape({
      url: "https://www.rtpro.yamaha.co.jp/RT/docs/misc/kanji-sjis.html",
    });

    expect(response.markdown).toContain("ぐ け げ こ ご さ ざ し じ す ず せ ぜ そ ぞ た");
  }, 30000);

  if (process.env.TEST_SUITE_SELF_HOSTED && process.env.PROXY_SERVER) {
    it.concurrent("self-hosted proxy works", async () => {
      const response = await scrape({
        url: "https://icanhazip.com"
      });

      expect(response.markdown?.trim()).toBe(process.env.PROXY_SERVER!.split("://").slice(-1)[0].split(":")[0]);
    }, 30000);
  }

  if (!process.env.TEST_SUITE_SELF_HOSTED || process.env.PLAYWRIGHT_MICROSERVICE_URL) {
    it.concurrent("waitFor works", async () => {
      const response = await scrape({
        url: "http://firecrawl.dev",
        waitFor: 2000,
      });
  
      expect(response.markdown).toContain("Firecrawl");
    }, 30000);
  }

  describe("JSON scrape support", () => {
    it.concurrent("returns parseable JSON", async () => {
      const response = await scrape({
        url: "https://jsonplaceholder.typicode.com/todos/1",
        formats: ["rawHtml"],
      });

      const obj = JSON.parse(response.rawHtml!);
      expect(obj.id).toBe(1);
    }, 30000);
  });

  if (!process.env.TEST_SUITE_SELF_HOSTED) {
    // describe("Ad blocking (f-e dependant)", () => {
    //   it.concurrent("blocks ads by default", async () => {
    //     const response = await scrape({
    //       url: "https://www.allrecipes.com/recipe/18185/yum/",
    //     });

    //     expect(response.markdown).not.toContain(".g.doubleclick.net/");
    //   }, 30000);

    //   it.concurrent("doesn't block ads if explicitly disabled", async () => {
    //     const response = await scrape({
    //       url: "https://www.allrecipes.com/recipe/18185/yum/",
    //       blockAds: false,
    //     });

    //     expect(response.markdown).toMatch(/(\.g\.doubleclick\.net|amazon-adsystem\.com)\//);
    //   }, 30000);
    // });

    describe("Change Tracking format", () => {
      it.concurrent("works", async () => {
        const response = await scrape({
          url: "https://example.com",
          formats: ["markdown", "changeTracking"],
        });

        expect(response.changeTracking).toBeDefined();
        expect(response.changeTracking?.previousScrapeAt).not.toBeNull();
      }, 30000);

      it.concurrent("includes git diff when requested", async () => {
        const response = await scrape({
          url: "https://example.com",
          formats: ["markdown", "changeTracking"],
          changeTrackingOptions: {
            modes: ["git-diff"]
          }
        });

        expect(response.changeTracking).toBeDefined();
        expect(response.changeTracking?.previousScrapeAt).not.toBeNull();
        
        if (response.changeTracking?.changeStatus === "changed") {
          expect(response.changeTracking?.diff).toBeDefined();
          expect(response.changeTracking?.diff?.text).toBeDefined();
          expect(response.changeTracking?.diff?.json).toBeDefined();
          expect(response.changeTracking?.diff?.json.files).toBeInstanceOf(Array);
        }
      }, 30000);
      
      it.concurrent("includes structured output when requested", async () => {
        const response = await scrape({
          url: "https://example.com",
          formats: ["markdown", "changeTracking"],
          changeTrackingOptions: {
            modes: ["json"],
            prompt: "Summarize the changes between the previous and current content",
          }
        });

        expect(response.changeTracking).toBeDefined();
        expect(response.changeTracking?.previousScrapeAt).not.toBeNull();
        
        if (response.changeTracking?.changeStatus === "changed") {
          expect(response.changeTracking?.json).toBeDefined();
        }
      }, 30000);
      
      it.concurrent("supports schema-based extraction for change tracking", async () => {
        const response = await scrape({
          url: "https://example.com",
          formats: ["markdown", "changeTracking"],
          changeTrackingOptions: {
            modes: ["json"],
            schema: {
              type: "object",
              properties: {
                pricing: { 
                  type: "object",
                  properties: {
                    amount: { type: "number" },
                    currency: { type: "string" }
                  }
                },
                features: { 
                  type: "array", 
                  items: { type: "string" } 
                }
              }
            }
          }
        });

        expect(response.changeTracking).toBeDefined();
        expect(response.changeTracking?.previousScrapeAt).not.toBeNull();
        
        if (response.changeTracking?.changeStatus === "changed") {
          expect(response.changeTracking?.json).toBeDefined();
          if (response.changeTracking?.json.pricing) {
            expect(response.changeTracking?.json.pricing).toHaveProperty("old");
            expect(response.changeTracking?.json.pricing).toHaveProperty("new");
          }
          if (response.changeTracking?.json.features) {
            expect(response.changeTracking?.json.features).toHaveProperty("old");
            expect(response.changeTracking?.json.features).toHaveProperty("new");
          }
        }
      }, 30000);
      
      it.concurrent("supports both git-diff and structured modes together", async () => {
        const response = await scrape({
          url: "https://example.com",
          formats: ["markdown", "changeTracking"],
          changeTrackingOptions: {
            modes: ["git-diff", "json"],
            schema: {
              type: "object",
              properties: {
                summary: { type: "string" },
                changes: { type: "array", items: { type: "string" } }
              }
            }
          }
        });

        expect(response.changeTracking).toBeDefined();
        expect(response.changeTracking?.previousScrapeAt).not.toBeNull();
        
        if (response.changeTracking?.changeStatus === "changed") {
          expect(response.changeTracking?.diff).toBeDefined();
          expect(response.changeTracking?.diff?.text).toBeDefined();
          expect(response.changeTracking?.diff?.json).toBeDefined();
          
          expect(response.changeTracking?.json).toBeDefined();
          expect(response.changeTracking?.json).toHaveProperty("summary");
          expect(response.changeTracking?.json).toHaveProperty("changes");
        }
      }, 30000);
    });

    describe("File-based Change Tracking (USE_DB_AUTHENTICATION=false)", () => {
      const MOCK_URL = "http://file-cache-test.com";
      const MOCK_MARKDOWN_V1 = "# Version 1";
      const MOCK_MARKDOWN_V2 = "# Version 2";
      const MOCK_CACHE_DIR = path.join(__dirname, '..', '..', '..', 'data', 'scrape_cache');
      const MOCK_HASH = crypto.createHash('sha256').update(MOCK_URL).digest('hex');
      const MOCK_FILE_PATH = path.join(MOCK_CACHE_DIR, `${MOCK_HASH}.json`);

      let originalDbAuthValue: string | undefined;
      beforeAll(() => {
        originalDbAuthValue = process.env.USE_DB_AUTHENTICATION;
        process.env.USE_DB_AUTHENTICATION = "false"; // Force file-based logic for these tests
      });

      afterAll(() => {
        process.env.USE_DB_AUTHENTICATION = originalDbAuthValue; // Restore original value
        jest.unmock('fs/promises'); // Clean up mock
      });

      beforeEach(() => {
        mockReadFile.mockReset();
        mockWriteFile.mockReset();
        mockMkdir.mockReset().mockResolvedValue(undefined);
      });

      it("should return 'new' status when no cache file exists and write cache", async () => {
        mockReadFile.mockRejectedValue({ code: 'ENOENT' });

        const mockMeta: Meta = { // Use full Meta type
            id: 'test-id', // Added required id
            url: MOCK_URL,
            options: { // Match ScrapeOptions defaults and requirements
                formats: ["changeTracking", "markdown"], // Added markdown as required
                changeTrackingOptions: { modes: [] },
                onlyMainContent: true, // Default from schema
                waitFor: 0, // Default from schema
                mobile: false, // Default from schema
                parsePDF: true, // Default from schema
                skipTlsVerification: false, // Default from schema
                removeBase64Images: true, // Default from schema
                fastMode: false, // Default from schema
                blockAds: true, // Default from schema
                headers: {},
                includeTags: undefined,
                excludeTags: undefined,
                timeout: undefined, // No default in base schema, transform might set one
                extract: undefined,
                jsonOptions: undefined,
                actions: undefined,
                location: undefined,
                geolocation: undefined, // Deprecated but in schema
                useMock: undefined,
                proxy: undefined,
            },
            internalOptions: { teamId: 'test-team-id', urlInvisibleInCurrentCrawl: false },
            logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), child: jest.fn().mockReturnThis() } as any,
            logs: [], // Added required logs
            featureFlags: new Set(), // Added required featureFlags
            mock: null, // Added required mock
            pdfPrefetch: undefined, // Added required pdfPrefetch
        };
        const mockDocument: Document = {

            metadata: { sourceURL: MOCK_URL, statusCode: 200 },
            markdown: MOCK_MARKDOWN_V1,
        };

        const resultDocument = await deriveDiff(mockMeta as Meta, mockDocument);

        expect(resultDocument.changeTracking?.changeStatus).toBe("new");
        expect(resultDocument.changeTracking?.previousScrapeAt).toBeNull();
        const expectedCacheDir = path.join(__dirname, '..', '..', '..', 'data', 'scrape_cache');
        expect(mockMkdir).toHaveBeenCalledWith(expectedCacheDir, { recursive: true });
        expect(mockReadFile).toHaveBeenCalledWith(MOCK_FILE_PATH, 'utf-8');
        expect(mockWriteFile).toHaveBeenCalledTimes(1);
        expect(mockWriteFile).toHaveBeenCalledWith(
          MOCK_FILE_PATH,
          expect.stringContaining(`"markdown": "${MOCK_MARKDOWN_V1}"`)
        );
      }, 30000);

      it("should return 'same' status when cache matches and overwrite cache", async () => {
        const previousTimestamp = new Date(Date.now() - 1000 * 60 * 60).toISOString();
        const cacheContent = JSON.stringify({ markdown: MOCK_MARKDOWN_V1, scrapedAt: previousTimestamp });
        mockReadFile.mockResolvedValue(cacheContent);

        const mockMeta: Partial<Meta> = {
            url: MOCK_URL,
            options: {
                formats: ["changeTracking", "markdown"], // Added markdown as it's required by changeTracking
                changeTrackingOptions: { modes: [] },
                onlyMainContent: true, // Default from schema
                waitFor: 0, // Default from schema
                mobile: false, // Default from schema
                parsePDF: true, // Default from schema
                skipTlsVerification: false, // Default from schema
                removeBase64Images: true, // Default from schema
                fastMode: false, // Default from schema
                blockAds: true, // Default from schema
                headers: {},
                includeTags: undefined,
                excludeTags: undefined,
                timeout: undefined, // No default in base schema, but transform might set one
                extract: undefined,
                jsonOptions: undefined,
                actions: undefined,
                location: undefined,
                geolocation: undefined, // Deprecated but in schema
                useMock: undefined,
                proxy: undefined,
            },
            internalOptions: { teamId: 'test-team-id', urlInvisibleInCurrentCrawl: false },
            logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), child: jest.fn().mockReturnThis() } as any,
        };
        const mockDocument: Document = {

            metadata: { sourceURL: MOCK_URL, statusCode: 200 },
            markdown: MOCK_MARKDOWN_V1, // Same markdown as cache
        };

        const resultDocument = await deriveDiff(mockMeta as Meta, mockDocument);

        expect(resultDocument.changeTracking?.changeStatus).toBe("same");
        expect(resultDocument.changeTracking?.previousScrapeAt).toBe(previousTimestamp);
        expect(mockWriteFile).toHaveBeenCalledTimes(1);
        const writtenData = JSON.parse(mockWriteFile.mock.calls[0][1]);
        expect(writtenData.markdown).toBe(MOCK_MARKDOWN_V1);
        expect(new Date(writtenData.scrapedAt) > new Date(previousTimestamp)).toBe(true);
      }, 30000);

      it("should return 'changed' status when cache differs and overwrite cache", async () => {
        const previousTimestamp = new Date(Date.now() - 1000 * 60 * 60).toISOString();
        const cacheContent = JSON.stringify({ markdown: MOCK_MARKDOWN_V1, scrapedAt: previousTimestamp });
        mockReadFile.mockResolvedValue(cacheContent);

        const mockMeta: Partial<Meta> = {
            url: MOCK_URL,
            options: {
                formats: ["changeTracking", "markdown"], // Added markdown as it's required by changeTracking
                changeTrackingOptions: { modes: [] },
                onlyMainContent: true, // Default from schema
                waitFor: 0, // Default from schema
                mobile: false, // Default from schema
                parsePDF: true, // Default from schema
                skipTlsVerification: false, // Default from schema
                removeBase64Images: true, // Default from schema
                fastMode: false, // Default from schema
                blockAds: true, // Default from schema
                headers: {},
                includeTags: undefined,
                excludeTags: undefined,
                timeout: undefined, // No default in base schema, but transform might set one
                extract: undefined,
                jsonOptions: undefined,
                actions: undefined,
                location: undefined,
                geolocation: undefined, // Deprecated but in schema
                useMock: undefined,
                proxy: undefined,
            },
            internalOptions: { teamId: 'test-team-id', urlInvisibleInCurrentCrawl: false },
            logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), child: jest.fn().mockReturnThis() } as any,
        };
        const mockDocument: Document = {

            metadata: { sourceURL: MOCK_URL, statusCode: 200 },
            markdown: MOCK_MARKDOWN_V2, // Different markdown
        };

        const resultDocument = await deriveDiff(mockMeta as Meta, mockDocument);

        expect(resultDocument.changeTracking?.changeStatus).toBe("changed");
        expect(resultDocument.changeTracking?.previousScrapeAt).toBe(previousTimestamp);
        expect(mockWriteFile).toHaveBeenCalledTimes(1);
        const writtenData = JSON.parse(mockWriteFile.mock.calls[0][1]);
        expect(writtenData.markdown).toBe(MOCK_MARKDOWN_V2);
        expect(new Date(writtenData.scrapedAt) > new Date(previousTimestamp)).toBe(true);
      }, 30000);

      it("should return 'removed' status on 404 and not write cache", async () => {
        const previousTimestamp = new Date(Date.now() - 1000 * 60 * 60).toISOString();
        const cacheContent = JSON.stringify({ markdown: MOCK_MARKDOWN_V1, scrapedAt: previousTimestamp });
        mockReadFile.mockResolvedValue(cacheContent);

        const mockMeta: Partial<Meta> = {
            url: MOCK_URL,
            options: {
                formats: ["changeTracking", "markdown"], // Added markdown as it's required by changeTracking
                changeTrackingOptions: { modes: [] },
                onlyMainContent: true, // Default from schema
                waitFor: 0, // Default from schema
                mobile: false, // Default from schema
                parsePDF: true, // Default from schema
                skipTlsVerification: false, // Default from schema
                removeBase64Images: true, // Default from schema
                fastMode: false, // Default from schema
                blockAds: true, // Default from schema
                headers: {},
                includeTags: undefined,
                excludeTags: undefined,
                timeout: undefined, // No default in base schema, but transform might set one
                extract: undefined,
                jsonOptions: undefined,
                actions: undefined,
                location: undefined,
                geolocation: undefined, // Deprecated but in schema
                useMock: undefined,
                proxy: undefined,
            },
            internalOptions: { teamId: 'test-team-id', urlInvisibleInCurrentCrawl: false },
            logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), child: jest.fn().mockReturnThis() } as any,
        };
        const mockDocument: Document = {

            metadata: { sourceURL: MOCK_URL, statusCode: 404 }, // Simulate 404
            markdown: "", // Markdown might be empty or irrelevant for 404
        };

        const resultDocument = await deriveDiff(mockMeta as Meta, mockDocument);

        expect(resultDocument.changeTracking?.changeStatus).toBe("removed");
        expect(resultDocument.changeTracking?.previousScrapeAt).toBe(previousTimestamp);
        expect(mockWriteFile).not.toHaveBeenCalled();
      }, 30000);

      it("should handle cache read errors gracefully", async () => {
        const readError = new Error("Disk read error");
        mockReadFile.mockRejectedValue(readError);

        const mockMeta: Meta = { // Use full Meta type
            id: 'test-id-' + Math.random().toString(36).substring(7), // Added required id with unique value
            url: MOCK_URL,
            options: { // Ensure all required fields from ScrapeRequestInput['pageOptions'] are present
                formats: ["changeTracking", "markdown"], // Added markdown as it's required by changeTracking
                changeTrackingOptions: { modes: [] },
                onlyMainContent: true, // Default from schema
                waitFor: 0, // Default from schema
                mobile: false, // Default from schema
                parsePDF: true, // Default from schema
                skipTlsVerification: false, // Default from schema
                removeBase64Images: true, // Default from schema
                fastMode: false, // Default from schema
                blockAds: true, // Default from schema
                headers: {},
                includeTags: undefined,
                excludeTags: undefined,
                timeout: undefined, // No default in base schema, but transform might set one
                extract: undefined,
                jsonOptions: undefined,
                actions: undefined,
                location: undefined,
                geolocation: undefined, // Deprecated but in schema
                useMock: undefined,
                proxy: undefined,
            },
            internalOptions: { teamId: 'test-team-id', urlInvisibleInCurrentCrawl: false },
            logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), child: jest.fn().mockReturnThis() } as any,
            logs: [], // Added required logs
            featureFlags: new Set(), // Added required featureFlags
            mock: null, // Added required mock
            pdfPrefetch: undefined, // Added required pdfPrefetch
        };

        const mockDocument: Document = {

             metadata: { sourceURL: MOCK_URL, statusCode: 200 },
             markdown: MOCK_MARKDOWN_V1,
         };

        const resultDocument = await deriveDiff(mockMeta as Meta, mockDocument);

        expect(resultDocument.changeTracking).toBeUndefined(); // Change tracking object won't be populated
        expect(resultDocument.warning).toContain("Comparing failed (cache read error)");
        expect(mockWriteFile).not.toHaveBeenCalled(); // Write shouldn't happen if read failed
      }, 30000);

      it("should NOT use fs when USE_DB_AUTHENTICATION is true", async () => {
         process.env.USE_DB_AUTHENTICATION = "true"; // Set for this test

        const mockDocument: Document = {

             metadata: { sourceURL: MOCK_URL, statusCode: 200 },
             markdown: MOCK_MARKDOWN_V1,
         };
        const mockMeta: Meta = { // Use full Meta type
            id: 'test-id-' + Math.random().toString(36).substring(7), // Added required id with unique value
            url: MOCK_URL,
            options: { // Ensure all required fields from ScrapeRequestInput['pageOptions'] are present
                formats: ["changeTracking", "markdown"], // Added markdown as it's required by changeTracking
                changeTrackingOptions: { modes: [] },
                onlyMainContent: true, // Default from schema
                waitFor: 0, // Default from schema
                mobile: false, // Default from schema
                parsePDF: true, // Default from schema
                skipTlsVerification: false, // Default from schema
                removeBase64Images: true, // Default from schema
                fastMode: false, // Default from schema
                blockAds: true, // Default from schema
                headers: {},
                includeTags: undefined,
                excludeTags: undefined,
                timeout: undefined, // No default in base schema, but transform might set one
                extract: undefined,
                jsonOptions: undefined,
                actions: undefined,
                location: undefined,
                geolocation: undefined, // Deprecated but in schema
                useMock: undefined,
                proxy: undefined,
            },
            internalOptions: { teamId: 'test-team-id', urlInvisibleInCurrentCrawl: false },
            logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), child: jest.fn().mockReturnThis() } as any,
            logs: [], // Added required logs
            featureFlags: new Set(), // Added required featureFlags
            mock: null, // Added required mock
            pdfPrefetch: undefined, // Added required pdfPrefetch
        };





         await deriveDiff(mockMeta as Meta, mockDocument);

         expect(mockReadFile).not.toHaveBeenCalled();
         expect(mockWriteFile).not.toHaveBeenCalled();
         expect(mockMkdir).not.toHaveBeenCalled();
         expect(mockSupabaseRpc).toHaveBeenCalledWith("diff_get_last_scrape_3", expect.any(Object)); // Verify DB path was attempted

         process.env.USE_DB_AUTHENTICATION = "false"; // Restore for subsequent tests in the suite
         jest.unmock('../../services/supabase'); // Clean up supabase mock
      }, 30000);

    }); // End describe File-based Change Tracking

  
    describe("Location API (f-e dependant)", () => {
      it.concurrent("works without specifying an explicit location", async () => {
        await scrape({
          url: "https://iplocation.com",
        });
      }, 30000);

      it.concurrent("works with country US", async () => {
        const response = await scrape({
          url: "https://iplocation.com",
          location: { country: "US" },
        });
    
        expect(response.markdown).toContain("| Country | United States |");
      }, 30000);
    });

    describe("Screenshot (f-e/sb dependant)", () => {
      it.concurrent("screenshot format works", async () => {
        const response = await scrape({
          url: "http://firecrawl.dev",
          formats: ["screenshot"]
        });
    
        expect(typeof response.screenshot).toBe("string");
      }, 30000);

      it.concurrent("screenshot@fullPage format works", async () => {
        const response = await scrape({
          url: "http://firecrawl.dev",
          formats: ["screenshot@fullPage"]
        });
    
        expect(typeof response.screenshot).toBe("string");
      }, 30000);
    });
  
    describe("Proxy API (f-e dependant)", () => {
      it.concurrent("undefined works", async () => {
        await scrape({
          url: "http://firecrawl.dev",
        });
      }, 30000);

      it.concurrent("basic works", async () => {
        await scrape({
          url: "http://firecrawl.dev",
          proxy: "basic",
        });
      }, 30000);

      it.concurrent("stealth works", async () => {
        await scrape({
          url: "http://firecrawl.dev",
          proxy: "stealth",
          timeout: 120000,
        });
      }, 130000);
    });
    
    // Temporarily disabled, too flaky
    // describe("PDF (f-e dependant)", () => {
    //   it.concurrent("works for PDFs behind anti-bot", async () => {
    //     const response = await scrape({
    //       url: "https://www.researchgate.net/profile/Amir-Leshem/publication/220732050_Robust_adaptive_beamforming_based_on_jointly_estimating_covariance_matrix_and_steering_vector/links/0c96052d2fd8f0a84b000000/Robust-adaptive-beamforming-based-on-jointly-estimating-covariance-matrix-and-steering-vector.pdf"
    //     });

    //     expect(response.markdown).toContain("Robust adaptive beamforming based on jointly estimating covariance matrix");
    //   }, 60000);
    // });
  }

  if (!process.env.TEST_SUITE_SELF_HOSTED || process.env.OPENAI_API_KEY || process.env.OLLAMA_BASE_URL) {
    describe("JSON format", () => {
      it.concurrent("works", async () => {
        const response = await scrape({
          url: "http://firecrawl.dev",
          formats: ["json"],
          jsonOptions: {
            prompt: "Based on the information on the page, find what the company's mission is and whether it supports SSO, and whether it is open source.",
            schema: {
              type: "object",
              properties: {
                company_mission: {
                  type: "string",
                },
                supports_sso: {
                  type: "boolean",
                },
                is_open_source: {
                  type: "boolean",
                },
              },
              required: ["company_mission", "supports_sso", "is_open_source"],
            },
          },
        });
    
        expect(response).toHaveProperty("json");
        expect(response.json).toHaveProperty("company_mission");
        expect(typeof response.json.company_mission).toBe("string");
        expect(response.json).toHaveProperty("supports_sso");
        expect(response.json.supports_sso).toBe(false);
        expect(typeof response.json.supports_sso).toBe("boolean");
        expect(response.json).toHaveProperty("is_open_source");
        expect(response.json.is_open_source).toBe(true);
        expect(typeof response.json.is_open_source).toBe("boolean");
      }, 30000);
    });
  }
});
