import { protocolIncluded, getURLobj, checkAndUpdateURL } from "../../lib/validateUrl";

describe("URL validation functions", () => {
  describe("protocolIncluded", () => {
    it("should return true for URLs with protocol", () => {
      expect(protocolIncluded("http://example.com")).toBe(true);
      expect(protocolIncluded("https://example.com")).toBe(true);
      expect(protocolIncluded("ftp://example.com")).toBe(true);
    });

    it("should return false for URLs without protocol", () => {
      expect(protocolIncluded("example.com")).toBe(false);
      expect(protocolIncluded("www.example.com")).toBe(false);
    });

    it("should handle edge cases correctly", () => {
      expect(protocolIncluded("http:example.com")).toBe(false); // missing //
      expect(protocolIncluded("http:/example.com")).toBe(false); // missing /
      expect(protocolIncluded("://example.com")).toBe(false); // missing protocol name
    });
  });

  describe("getURLobj", () => {
    it("should return a URL object for valid URLs", () => {
      const { error, urlObj } = getURLobj("http://example.com");
      expect(error).toBe(false);
      expect(urlObj instanceof URL).toBe(true);
    });

    it("should handle URLs without protocol by returning error", () => {
      const { error, urlObj } = getURLobj("example.com");
      expect(error).toBe(true);
      expect(urlObj).toEqual({});
    });

    it("should handle invalid URLs by returning error", () => {
      const { error, urlObj } = getURLobj("http://");
      expect(error).toBe(true);
      expect(urlObj).toEqual({});
    });
  });

  describe("checkAndUpdateURL", () => {
    it("should add http:// to URLs without protocol", () => {
      const result = checkAndUpdateURL("example.com");
      expect(result.error).toBe(false);
      expect(result.url).toBe("http://example.com");
      expect(result.urlObj instanceof URL).toBe(true);
    });

    it("should not modify URLs with protocol", () => {
      const result = checkAndUpdateURL("https://example.com");
      expect(result.error).toBe(false);
      expect(result.url).toBe("https://example.com");
      expect(result.urlObj instanceof URL).toBe(true);
    });

    it("should return error for invalid URLs", () => {
      const result = checkAndUpdateURL("http://");
      expect(result.error).toBe(true);
      expect(result.urlObj).toBe(null);
    });

    it("should return error for non-http/https protocols", () => {
      const result = checkAndUpdateURL("ftp://example.com");
      expect(result.error).toBe(true);
      expect(result.urlObj).toBe(null);
    });
  });
});
