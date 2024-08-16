import { isSameDomain } from "./validateUrl";
import { isSameSubdomain } from "./validateUrl";

describe("isSameDomain", () => {
  it("should return true for a subdomain", () => {
    const result = isSameDomain("http://sub.example.com", "http://example.com");
    expect(result).toBe(true);
  });

  it("should return true for the same domain", () => {
    const result = isSameDomain("http://example.com", "http://example.com");
    expect(result).toBe(true);
  });

  it("should return false for different domains", () => {
    const result = isSameDomain("http://example.com", "http://another.com");
    expect(result).toBe(false);
  });

  it("should return true for a subdomain with different protocols", () => {
    const result = isSameDomain("https://sub.example.com", "http://example.com");
    expect(result).toBe(true);
  });

  it("should return false for invalid URLs", () => {
    const result = isSameDomain("invalid-url", "http://example.com");
    expect(result).toBe(false);
    const result2 = isSameDomain("http://example.com", "invalid-url");
    expect(result2).toBe(false);
  });

  it("should return true for a subdomain with www prefix", () => {
    const result = isSameDomain("http://www.sub.example.com", "http://example.com");
    expect(result).toBe(true);
  });

  it("should return true for the same domain with www prefix", () => {
    const result = isSameDomain("http://docs.s.s.example.com", "http://example.com");
    expect(result).toBe(true);
  });
});


    

describe("isSameSubdomain", () => {
  it("should return false for a subdomain", () => {
    const result = isSameSubdomain("http://example.com", "http://docs.example.com");
    expect(result).toBe(false);
  });

  it("should return true for the same subdomain", () => {
    const result = isSameSubdomain("http://docs.example.com", "http://docs.example.com");
    expect(result).toBe(true);
  });

  it("should return false for different subdomains", () => {
    const result = isSameSubdomain("http://docs.example.com", "http://blog.example.com");
    expect(result).toBe(false);
  });

  it("should return false for different domains", () => {
    const result = isSameSubdomain("http://example.com", "http://another.com");
    expect(result).toBe(false);
  });

  it("should return false for invalid URLs", () => {
    const result = isSameSubdomain("invalid-url", "http://example.com");
    expect(result).toBe(false);
    const result2 = isSameSubdomain("http://example.com", "invalid-url");
    expect(result2).toBe(false);
  });

  it("should return true for the same subdomain with different protocols", () => {
    const result = isSameSubdomain("https://docs.example.com", "http://docs.example.com");
    expect(result).toBe(true);
  });

  it("should return true for the same subdomain with www prefix", () => {
    const result = isSameSubdomain("http://www.docs.example.com", "http://docs.example.com");
    expect(result).toBe(true);
  });

  it("should return false for a subdomain with www prefix and different subdomain", () => {
    const result = isSameSubdomain("http://www.docs.example.com", "http://blog.example.com");
    expect(result).toBe(false);
  });
});