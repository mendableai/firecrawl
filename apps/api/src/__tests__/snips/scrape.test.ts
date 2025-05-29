import { scrape, scrapeStatus, scrapeWithFailure } from "./lib";

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
    it.concurrent("scrape status works", async () => {
      const response = await scrape({
        url: "http://firecrawl.dev"
      });
  
      expect(response.markdown).toContain("Firecrawl");
  
      const status = await scrapeStatus(response.metadata.scrapeId!);
      expect(JSON.stringify(status)).toBe(JSON.stringify(response));
    }, 60000);
    
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

      it.concurrent("auto works properly on non-stealth site", async () => {
        const res = await scrape({
          url: "http://firecrawl.dev",
          proxy: "auto",
          timeout: 120000,
        });

        expect(res.metadata.proxyUsed).toBe("basic");
      }, 130000);

      it.concurrent("auto works properly on 'stealth' site (faked for reliabile testing)", async () => {
        const res = await scrape({
          url: "https://httpstat.us/403",
          proxy: "auto",
          timeout: 120000,
        });

        expect(res.metadata.proxyUsed).toBe("stealth");
      }, 130000);
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

  it.concurrent("sourceURL stays unnormalized", async () => {
    const response = await scrape({
      url: "https://firecrawl.dev/?pagewanted=all&et_blog",
    });

    expect(response.metadata.sourceURL).toBe("https://firecrawl.dev/?pagewanted=all&et_blog");
  }, 30000);

  it.concurrent("application/json content type is markdownified properly", async () => {
    const response = await scrape({
      url: "https://jsonplaceholder.typicode.com/todos/1",
      formats: ["markdown"],
    });

    expect(response.markdown).toContain("```json");
  }, 30000);
});
