import { getResponseProtocol } from "../../lib/protocol-utils";
import { describe, it, expect } from "@jest/globals";

describe("Protocol Utils", () => {
  const createMockRequest = (protocol: string, host: string): any => ({
    protocol,
    get: (header: string) => header === "host" ? host : undefined,
  });

  it("should return http for localhost http requests", () => {
    const req = createMockRequest("http", "localhost:3002");
    expect(getResponseProtocol(req)).toBe("http");
  });

  it("should return https for localhost https requests", () => {
    const req = createMockRequest("https", "localhost:3002");
    expect(getResponseProtocol(req)).toBe("https");
  });

  it("should return http for 127.0.0.1 http requests", () => {
    const req = createMockRequest("http", "127.0.0.1:3002");
    expect(getResponseProtocol(req)).toBe("http");
  });

  it("should return http for 0.0.0.0 http requests", () => {
    const req = createMockRequest("http", "0.0.0.0:3002");
    expect(getResponseProtocol(req)).toBe("http");
  });

  it("should return https for production domains regardless of request protocol", () => {
    const req = createMockRequest("http", "api.firecrawl.dev");
    expect(getResponseProtocol(req)).toBe("https");
  });

  it("should return https for production domains with https", () => {
    const req = createMockRequest("https", "api.firecrawl.dev");
    expect(getResponseProtocol(req)).toBe("https");
  });

  it("should handle missing host header", () => {
    const req = createMockRequest("http", "");
    expect(getResponseProtocol(req)).toBe("https");
  });
});
