import request from "supertest";
import dotenv from "dotenv";
import {
  FirecrawlCrawlResponse,
  FirecrawlCrawlStatusResponse,
  FirecrawlScrapeResponse,
} from "../../types";

dotenv.config();
const TEST_URL = "http://127.0.0.1:3002";

describe("E2E Tests for Extract API Routes", () => {
  it.concurrent("should return authors of blog posts on firecrawl.dev", async () => {
    const response = await request(TEST_URL)
      .post("/v1/extract")
      .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
      .set("Content-Type", "application/json")
      .send({
        urls: ["https://firecrawl.dev/*"],
        prompt: "Who are the authors of the blog posts?",
        schema: {
          type: "object",
          properties: { authors: { type: "array", items: { type: "string" } } },
        },
      });

    console.log(response.body);
    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty("data");
    expect(response.body.data).toHaveProperty("authors");

    let gotItRight = 0;
    for (const author of response.body.data?.authors) {
      if (author.includes("Caleb Peffer")) gotItRight++;
      if (author.includes("Gergő Móricz")) gotItRight++;
      if (author.includes("Eric Ciarla")) gotItRight++;
      if (author.includes("Nicolas Camara")) gotItRight++;
      if (author.includes("Jon")) gotItRight++;
      if (author.includes("Wendong")) gotItRight++;

    }

    expect(gotItRight).toBeGreaterThan(1);
  }, 60000);

  it.concurrent("should return founders of firecrawl.dev (allowExternalLinks = true)", async () => {
    const response = await request(TEST_URL)
      .post("/v1/extract")
      .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
      .set("Content-Type", "application/json")
      .send({
        urls: ["firecrawl.dev/*"],
        prompt: "Who are the founders of the company?",
        allowExternalLinks: true,
        schema: {
          type: "object",
          properties: { founders: { type: "array", items: { type: "string" } } },
        },
      });
    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty("data");
    expect(response.body.data).toHaveProperty("founders");

    console.log(response.body.data?.founders);
    let gotItRight = 0;
    for (const founder of response.body.data?.founders) {
      if (founder.includes("Caleb")) gotItRight++;
      if (founder.includes("Eric")) gotItRight++;
      if (founder.includes("Nicolas")) gotItRight++;

    }

    expect(gotItRight).toBeGreaterThanOrEqual(2);
  }, 60000);

  it.concurrent("should return hiring opportunities on firecrawl.dev (allowExternalLinks = true)", async () => {
    const response = await request(TEST_URL)
      .post("/v1/extract")
      .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
      .set("Content-Type", "application/json")
      .send({
        urls: ["https://firecrawl.dev/*"],
        prompt: "What are they hiring for?",
        allowExternalLinks: true,
        schema: {
          type: "array",
          items: {
            type: "string"
          }
        },
      });
    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty("data");
    console.log(response.body.data);

    let gotItRight = 0;
    for (const hiring of response.body.data?.items) {
      if (hiring.includes("Developer Support Engineer")) gotItRight++;
      if (hiring.includes("Dev Ops Engineer")) gotItRight++;
      if (hiring.includes("Founding Web Automation Engineer")) gotItRight++;
    }

    expect(gotItRight).toBeGreaterThan(2);
  }, 60000);

  it.concurrent("should return PCI DSS compliance for Fivetran", async () => {
    const response = await request(TEST_URL)
      .post("/v1/extract")
      .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
      .set("Content-Type", "application/json")
      .send({
        urls: ["fivetran.com/*"],
        prompt: "Does Fivetran have PCI DSS compliance?",
        allowExternalLinks: true,
        schema: {
          type: "object",
          properties: {
            pciDssCompliance: { type: "boolean" }
          }
        },
      });
    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty("data");
    expect(response.body.data?.pciDssCompliance).toBe(true);
  }, 60000);

  it.concurrent("should return Azure Data Connectors for Fivetran", async () => {
    const response = await request(TEST_URL)
      .post("/v1/extract")
      .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
      .set("Content-Type", "application/json")
      .send({
        urls: ["fivetran.com/*"],
        prompt: "What are the Azure Data Connectors they offer?",
        schema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              connector: { type: "string" },
              description: { type: "string" },
              supportsCaptureDelete: { type: "boolean" }
            }
          }
        }
      })

    console.log(response.body);
    // expect(response.statusCode).toBe(200);
    // expect(response.body).toHaveProperty("data");
    // expect(response.body.data?.pciDssCompliance).toBe(true);
  }, 60000);
});
