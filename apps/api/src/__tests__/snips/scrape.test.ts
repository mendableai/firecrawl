import { scrape, scrapeStatus, scrapeWithFailure } from "./lib";
import crypto from "crypto";

describe("Scrape tests", () => {
  it.concurrent("mocking works properly", async () => {
    // depends on falsified mock mocking-works-properly
    // this test will fail if mock is bypassed with real data -- firecrawl.dev will never have
    // that as its actual markdown output

    const response = await scrape({
      url: "http://firecrawl.dev",
      useMock: "mocking-works-properly",
      timeout: 60000,
    });

    expect(response.markdown).toBe(
      "this is fake data coming from the mocking system!",
    );
  }, 60000);

  it.concurrent("works", async () => {
    const response = await scrape({
      url: "http://firecrawl.dev",
      timeout: 60000,
    });

    expect(response.markdown).toContain("Firecrawl");
  }, 60000);

  it.concurrent("handles non-UTF-8 encodings", async () => {
    const response = await scrape({
      url: "https://www.rtpro.yamaha.co.jp/RT/docs/misc/kanji-sjis.html",
      timeout: 60000,
    });

    expect(response.markdown).toContain("ぐ け げ こ ご さ ざ し じ す ず せ ぜ そ ぞ た");
  }, 60000);

  if (process.env.TEST_SUITE_SELF_HOSTED && process.env.PROXY_SERVER) {
    it.concurrent("self-hosted proxy works", async () => {
      const response = await scrape({
        url: "https://icanhazip.com",
        timeout: 60000,
      });

      expect(response.markdown?.trim()).toContain(process.env.PROXY_SERVER!.split("://").slice(-1)[0].split(":")[0]);
    }, 70000);

    it.concurrent("self-hosted proxy works on playwright", async () => {
      const response = await scrape({
        url: "https://icanhazip.com",
        waitFor: 100,
        timeout: 60000,
      });

      expect(response.markdown?.trim()).toContain(process.env.PROXY_SERVER!.split("://").slice(-1)[0].split(":")[0]);
    }, 70000);
  }

  if (!process.env.TEST_SUITE_SELF_HOSTED || process.env.PLAYWRIGHT_MICROSERVICE_URL) {
    it.concurrent("waitFor works", async () => {
      const response = await scrape({
        url: "http://firecrawl.dev",
        waitFor: 2000,
        timeout: 60000,
      });
  
      expect(response.markdown).toContain("Firecrawl");
    }, 60000);
  }

  describe("JSON scrape support", () => {
    it.concurrent("returns parseable JSON", async () => {
      const response = await scrape({
        url: "https://jsonplaceholder.typicode.com/todos/1",
        formats: ["rawHtml"],
        timeout: 60000,
      });

      const obj = JSON.parse(response.rawHtml!);
      expect(obj.id).toBe(1);
    }, 70000);
  });

  if (!process.env.TEST_SUITE_SELF_HOSTED) {
    it.concurrent("scrape status works", async () => {
      const response = await scrape({
        url: "http://firecrawl.dev",
        timeout: 60000,
      });
  
      expect(response.markdown).toContain("Firecrawl");

      // Give time to propagate to read replica
      await new Promise(resolve => setTimeout(resolve, 1000));
  
      const status = await scrapeStatus(response.metadata.scrapeId!);
      expect(JSON.stringify(status)).toBe(JSON.stringify(response));
    }, 70000);
    
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
    
    describe("Index", () => {
      it.concurrent("caches properly", async () => {
        const id = crypto.randomUUID();
        const url = "https://firecrawl.dev/?testId=" + id;

        const response1 = await scrape({
          url,
          maxAge: 120000,
          storeInCache: false,
          timeout: 60000,
        });

        expect(response1.metadata.cacheState).toBe("miss");

        await new Promise(resolve => setTimeout(resolve, 17000));

        const response2 = await scrape({
          url,
          maxAge: 120000,
          timeout: 60000,
        });

        expect(response2.metadata.cacheState).toBe("miss");

        await new Promise(resolve => setTimeout(resolve, 17000));

        const response3 = await scrape({
          url,
          maxAge: 120000,
          timeout: 60000,
        });

        expect(response3.metadata.cacheState).toBe("hit");
        expect(response3.metadata.cachedAt).toBeDefined();
        
        const response4 = await scrape({
          url,
          maxAge: 1,
          timeout: 60000,
        });
        
        expect(response4.metadata.cacheState).toBe("miss");
      }, 150000 + 2 * 17000);

      it.concurrent("respects screenshot", async () => {
        const id = crypto.randomUUID();
        const url = "https://firecrawl.dev/?testId=" + id;

        const response1 = await scrape({
          url,
          formats: ["screenshot"],
          timeout: 60000,
        });

        expect(response1.screenshot).toBeDefined();

        await new Promise(resolve => setTimeout(resolve, 17000));

        const response2 = await scrape({
          url,
          formats: ["screenshot"],
          timeout: 60000,
          maxAge: 120000,
        });

        expect(response2.screenshot).toBe(response1.screenshot);

        const response3 = await scrape({
          url,
          formats: ["screenshot@fullPage"],
          timeout: 60000,
          maxAge: 180000,
        });

        expect(response3.screenshot).not.toBe(response1.screenshot);
        expect(response3.metadata.cacheState).toBe("miss");
      }, 207000);

      it.concurrent("respects screenshot@fullPage", async () => {
        const id = crypto.randomUUID();
        const url = "https://firecrawl.dev/?testId=" + id;

        const response1 = await scrape({
          url,
          formats: ["screenshot@fullPage"],
          timeout: 60000,
        });

        expect(response1.screenshot).toBeDefined();

        await new Promise(resolve => setTimeout(resolve, 17000));

        const response2 = await scrape({ 
          url,
          formats: ["screenshot@fullPage"],
          timeout: 60000,
          maxAge: 120000,
        });

        expect(response2.screenshot).toBe(response1.screenshot);

        const response3 = await scrape({
          url,
          formats: ["screenshot"],
          timeout: 60000,
          maxAge: 180000,
        });

        expect(response3.screenshot).not.toBe(response1.screenshot);
        expect(response3.metadata.cacheState).toBe("miss");
      }, 207000);

      it.concurrent("respects changeTracking", async () => {
        const id = crypto.randomUUID();
        const url = "https://firecrawl.dev/?testId=" + id;

        await scrape({
          url,
          formats: ["markdown", "changeTracking"],
          timeout: 60000,
        });

        const response1 = await scrape({
          url,
          formats: ["markdown", "changeTracking"],
          timeout: 60000,
          maxAge: 120000,
        });

        expect(response1.metadata.cacheState).not.toBeDefined();

        await new Promise(resolve => setTimeout(resolve, 17000));

        const response2 = await scrape({
          url,
          formats: ["markdown"],
          timeout: 60000,
          maxAge: 180000,
        });

        expect(response2.metadata.cacheState).toBe("hit");
      }, 147000);

      it.concurrent("respects headers", async () => {
        const id = crypto.randomUUID();
        const url = "https://firecrawl.dev/?testId=" + id;

        await scrape({
          url,
          headers: {
            "X-Test": "test",
          },
          timeout: 60000,
        });

        await new Promise(resolve => setTimeout(resolve, 17000));

        const response = await scrape({
          url,
          timeout: 60000,
          maxAge: 120000,
        });

        expect(response.metadata.cacheState).toBe("miss");
      }, 147000);

      it.concurrent("respects mobile", async () => {
        const id = crypto.randomUUID();
        const url = "https://firecrawl.dev/?testId=" + id;

        await scrape({
          url,
          timeout: 60000,
        });

        await new Promise(resolve => setTimeout(resolve, 17000));

        const response1 = await scrape({
          url,
          timeout: 60000,
          maxAge: 120000,
          mobile: true,
        });

        expect(response1.metadata.cacheState).toBe("miss");

        await new Promise(resolve => setTimeout(resolve, 17000));

        const response2 = await scrape({
          url,
          timeout: 60000,
          maxAge: 180000,
          mobile: true,
        });

        expect(response2.metadata.cacheState).toBe("hit");
      }, 224000);

      it.concurrent("respects actions", async () => {
        const id = crypto.randomUUID();
        const url = "https://firecrawl.dev/?testId=" + id;

        const response1 = await scrape({
          url,
          timeout: 60000,
          maxAge: 60000,
          actions: [{
            "type": "wait",
            "milliseconds": 1000,
          }]
        });

        expect(response1.metadata.cacheState).not.toBeDefined();

        await new Promise(resolve => setTimeout(resolve, 17000));

        const response2 = await scrape({
          url,
          timeout: 60000,
          maxAge: 120000,
        });

        expect(response2.metadata.cacheState).toBe("miss");
      }, 147000);

      it.concurrent("respects location", async () => {
        const id = crypto.randomUUID();
        const url = "https://firecrawl.dev/?testId=" + id;

        await scrape({
          url,
          timeout: 60000,
        });

        await new Promise(resolve => setTimeout(resolve, 17000));

        const response1 = await scrape({
          url,
          location: { country: "BR" },
          maxAge: 120000,
          timeout: 60000,
        });

        expect(response1.metadata.cacheState).toBe("miss");

        await new Promise(resolve => setTimeout(resolve, 17000));

        const response2 = await scrape({
          url,
          location: { country: "BR" },
          timeout: 60000,
          maxAge: 180000,
        });

        expect(response2.metadata.cacheState).toBe("hit");
      }, 224000);

      it.concurrent("respects blockAds", async () => {
        const id = crypto.randomUUID();
        const url = "https://firecrawl.dev/?testId=" + id;

        await scrape({
          url,
          blockAds: true,
          timeout: 60000,
        });

        await new Promise(resolve => setTimeout(resolve, 17000));

        const response0 = await scrape({
          url,
          blockAds: true,
          timeout: 60000,
          maxAge: 120000,
        });

        expect(response0.metadata.cacheState).toBe("hit");

        const response1 = await scrape({
          url,
          blockAds: false,
          timeout: 60000,
          maxAge: 180000,
        });

        expect(response1.metadata.cacheState).toBe("miss");

        await new Promise(resolve => setTimeout(resolve, 17000));

        const response2 = await scrape({
          url,
          blockAds: false,
          timeout: 60000,
          maxAge: 240000,
        });

        expect(response2.metadata.cacheState).toBe("hit");
      }, 284000);

      it.concurrent("respects proxy: stealth", async () => {
        const id = crypto.randomUUID();
        const url = "https://firecrawl.dev/?testId=" + id;

        const response1 = await scrape({
          url,
          proxy: "stealth",
          timeout: 60000,
          maxAge: 60000,
        });

        expect(response1.metadata.proxyUsed).toBe("stealth");
        expect(response1.metadata.cacheState).not.toBeDefined();

        await new Promise(resolve => setTimeout(resolve, 17000));

        const response2 = await scrape({
          url,
          timeout: 60000,
          maxAge: 120000,
        });

        expect(response2.metadata.cacheState).toBe("hit");

        const response3 = await scrape({
          url,
          proxy: "stealth",
          timeout: 60000,
          maxAge: 180000,
        });

        expect(response3.metadata.cacheState).not.toBeDefined();
      }, 207000);

      it.concurrent("works properly on pages returning 200", async () => {
        const id = crypto.randomUUID();
        const url = "https://httpstat.us/200?testId=" + id;

        await scrape({
          url,
          timeout: 60000,
        });

        await new Promise(resolve => setTimeout(resolve, 17000));

        const response = await scrape({
          url,
          timeout: 60000,
          maxAge: 120000,
        });

        expect(response.metadata.cacheState).toBe("hit");
      }, 147000);

      it.concurrent("works properly on pages returning errors", async () => {
        const id = crypto.randomUUID();
        const url = "https://httpstat.us/404?testId=" + id;

        await scrape({
          url,
          timeout: 60000,
        });

        const response1 = await scrape({
          url,
          timeout: 60000,
          maxAge: 120000,
        });

        expect(response1.metadata.cacheState).toBe("miss");

        const response2 = await scrape({
          url,
          timeout: 60000,
          maxAge: 180000,
        });

        expect(response2.metadata.cacheState).toBe("miss");

        await new Promise(resolve => setTimeout(resolve, 17000));

        const response3 = await scrape({
          url,
          timeout: 60000,
          maxAge: 240000,
        });

        expect(response3.metadata.cacheState).toBe("hit");
      }, 284000);
    });

    describe("Change Tracking format", () => {
      it.concurrent("works", async () => {
        const response = await scrape({
          url: "https://example.com",
          formats: ["markdown", "changeTracking"],
          timeout: 60000,
        });

        expect(response.changeTracking).toBeDefined();
        expect(response.changeTracking?.previousScrapeAt).not.toBeNull();
      }, 60000);

      it.concurrent("includes git diff when requested", async () => {
        const response = await scrape({
          url: "https://example.com",
          formats: ["markdown", "changeTracking"],
          changeTrackingOptions: {
            modes: ["git-diff"]
          },
          timeout: 60000,
        });

        expect(response.changeTracking).toBeDefined();
        expect(response.changeTracking?.previousScrapeAt).not.toBeNull();
        
        if (response.changeTracking?.changeStatus === "changed") {
          expect(response.changeTracking?.diff).toBeDefined();
          expect(response.changeTracking?.diff?.text).toBeDefined();
          expect(response.changeTracking?.diff?.json).toBeDefined();
          expect(response.changeTracking?.diff?.json.files).toBeInstanceOf(Array);
        }
      }, 60000);
      
      it.concurrent("includes structured output when requested", async () => {
        const response = await scrape({
          url: "https://example.com",
          formats: ["markdown", "changeTracking"],
          changeTrackingOptions: {
            modes: ["json"],
            prompt: "Summarize the changes between the previous and current content",
          },
          timeout: 60000,
        });

        expect(response.changeTracking).toBeDefined();
        expect(response.changeTracking?.previousScrapeAt).not.toBeNull();
        
        if (response.changeTracking?.changeStatus === "changed") {
          expect(response.changeTracking?.json).toBeDefined();
        }
      }, 60000);
      
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
          },
          timeout: 60000,
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
      }, 60000);
      
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
          },
          timeout: 60000,
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
      }, 60000);

      it.concurrent("supports tags properly", async () => {
        const uuid1 = crypto.randomUUID();
        const uuid2 = crypto.randomUUID();

        const response1 = await scrape({
          url: "https://firecrawl.dev/",
          formats: ["markdown", "changeTracking"],
          changeTrackingOptions: { tag: uuid1 },
          timeout: 60000,
        });

        const response2 = await scrape({
          url: "https://firecrawl.dev/",
          formats: ["markdown", "changeTracking"],
          changeTrackingOptions: { tag: uuid2 },
          timeout: 60000,
        });

        expect(response1.changeTracking?.previousScrapeAt).toBeNull();
        expect(response1.changeTracking?.changeStatus).toBe("new");
        expect(response2.changeTracking?.previousScrapeAt).toBeNull();
        expect(response2.changeTracking?.changeStatus).toBe("new");

        const response3 = await scrape({
          url: "https://firecrawl.dev/",
          formats: ["markdown", "changeTracking"],
          changeTrackingOptions: { tag: uuid1 },
          timeout: 60000,
        });

        expect(response3.changeTracking?.previousScrapeAt).not.toBeNull();
        expect(response3.changeTracking?.changeStatus).not.toBe("new");
      }, 180000);
    });
  
    describe("Location API (f-e dependant)", () => {
      it.concurrent("works without specifying an explicit location", async () => {
        await scrape({
          url: "https://iplocation.com",
          timeout: 60000,
        });
      }, 70000);

      it.concurrent("works with country US", async () => {
        const response = await scrape({
          url: "https://iplocation.com",
          location: { country: "US" },
          timeout: 60000,
        });
    
        expect(response.markdown).toContain("| Country | United States |");
      }, 70000);
    });

    describe("Screenshot (f-e/sb dependant)", () => {
      it.concurrent("screenshot format works", async () => {
        const response = await scrape({
          url: "http://firecrawl.dev",
          formats: ["screenshot"],
          timeout: 60000,
        });
    
        expect(typeof response.screenshot).toBe("string");
      }, 70000);

      it.concurrent("screenshot@fullPage format works", async () => {
        const response = await scrape({
          url: "http://firecrawl.dev",
          formats: ["screenshot@fullPage"],
          timeout: 60000,
        });
    
        expect(typeof response.screenshot).toBe("string");
      }, 70000);
    });
  
    describe("Proxy API (f-e dependant)", () => {
      it.concurrent("undefined works", async () => {
        await scrape({
          url: "http://firecrawl.dev",
          timeout: 60000,
        });
      }, 70000);

      it.concurrent("basic works", async () => {
        await scrape({
          url: "http://firecrawl.dev",
          proxy: "basic",
          timeout: 60000,
        });
      }, 70000);

      it.concurrent("stealth works", async () => {
        await scrape({
          url: "http://firecrawl.dev",
          proxy: "stealth",
          timeout: 120000,
        });
      }, 140000);

      it.concurrent("auto works properly on non-stealth site", async () => {
        const res = await scrape({
          url: "http://firecrawl.dev",
          proxy: "auto",
          timeout: 120000,
        });

        expect(res.metadata.proxyUsed).toBe("basic");
      }, 140000);

      it.concurrent("auto works properly on 'stealth' site (faked for reliabile testing)", async () => {
        const res = await scrape({
          url: "https://httpstat.us/403",
          proxy: "auto",
          timeout: 120000,
        });

        expect(res.metadata.proxyUsed).toBe("stealth");
      }, 140000);
    });
    
    describe("PDF (f-e dependant)", () => {
      // Temporarily disabled, too flaky
      // it.concurrent("works for PDFs behind anti-bot", async () => {
      //   const response = await scrape({
      //     url: "https://www.researchgate.net/profile/Amir-Leshem/publication/220732050_Robust_adaptive_beamforming_based_on_jointly_estimating_covariance_matrix_and_steering_vector/links/0c96052d2fd8f0a84b000000/Robust-adaptive-beamforming-based-on-jointly-estimating-covariance-matrix-and-steering-vector.pdf"
      //   });

      //   expect(response.markdown).toContain("Robust adaptive beamforming based on jointly estimating covariance matrix");
      // }, 60000);

      it.concurrent("blocks long PDFs with insufficient timeout", async () => {
        const response = await scrapeWithFailure({
          url: "https://ecma-international.org/wp-content/uploads/ECMA-262_15th_edition_june_2024.pdf",
          timeout: 30000,
        });

        expect(response.error).toContain("Insufficient time to process PDF");
      }, 30000);

      it.concurrent("scrapes long PDFs with sufficient timeout", async () => {
        const response = await scrape({
          url: "https://ecma-international.org/wp-content/uploads/ECMA-262_15th_edition_june_2024.pdf",
          timeout: 300000,
        });

        // text on the last page
        expect(response.markdown).toContain("Redistribution and use in source and binary forms, with or without modification");
      }, 310000);
    });
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
          timeout: 60000,
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
      }, 60000);
    });
  }

  it.concurrent("sourceURL stays unnormalized", async () => {
    const response = await scrape({
      url: "https://firecrawl.dev/?pagewanted=all&et_blog",
      timeout: 60000,
    });

    expect(response.metadata.sourceURL).toBe("https://firecrawl.dev/?pagewanted=all&et_blog");
  }, 60000);

  it.concurrent("application/json content type is markdownified properly", async () => {
    const response = await scrape({
      url: "https://jsonplaceholder.typicode.com/todos/1",
      formats: ["markdown"],
      timeout: 60000,
    });

    expect(response.markdown).toContain("```json");
  }, 60000);
});
