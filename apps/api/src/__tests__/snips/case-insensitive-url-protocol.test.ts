import { protocolIncluded, checkAndUpdateURL, checkUrl, checkAndUpdateURLForMap } from "../../lib/validateUrl";
import { url } from "../../controllers/v1/types";

describe("Case-insensitive URL protocol validation", () => {
  describe("protocolIncluded", () => {
    test("should detect lowercase protocols", () => {
      expect(protocolIncluded("http://example.com")).toBe(true);
      expect(protocolIncluded("https://example.com")).toBe(true);
    });

    test("should detect uppercase protocols", () => {
      expect(protocolIncluded("HTTP://example.com")).toBe(true);
      expect(protocolIncluded("HTTPS://example.com")).toBe(true);
    });

    test("should detect mixed case protocols", () => {
      expect(protocolIncluded("Http://example.com")).toBe(true);
      expect(protocolIncluded("Https://example.com")).toBe(true);
      expect(protocolIncluded("HtTpS://example.com")).toBe(true);
    });

    test("should return false for URLs without protocols", () => {
      expect(protocolIncluded("example.com")).toBe(false);
      expect(protocolIncluded("www.example.com")).toBe(false);
    });
  });

  describe("checkAndUpdateURL", () => {
    test("should accept lowercase protocols", () => {
      expect(() => checkAndUpdateURL("http://example.com")).not.toThrow();
      expect(() => checkAndUpdateURL("https://example.com")).not.toThrow();
    });

    test("should accept uppercase protocols", () => {
      expect(() => checkAndUpdateURL("HTTP://example.com")).not.toThrow();
      expect(() => checkAndUpdateURL("HTTPS://example.com")).not.toThrow();
    });

    test("should accept mixed case protocols", () => {
      expect(() => checkAndUpdateURL("Http://example.com")).not.toThrow();
      expect(() => checkAndUpdateURL("Https://example.com")).not.toThrow();
    });
  });

  describe("checkUrl", () => {
    test("should accept lowercase protocols", () => {
      expect(() => checkUrl("http://example.com")).not.toThrow();
      expect(() => checkUrl("https://example.com")).not.toThrow();
    });

    test("should accept uppercase protocols", () => {
      expect(() => checkUrl("HTTP://example.com")).not.toThrow();
      expect(() => checkUrl("HTTPS://example.com")).not.toThrow();
    });

    test("should accept mixed case protocols", () => {
      expect(() => checkUrl("Http://example.com")).not.toThrow();
      expect(() => checkUrl("Https://example.com")).not.toThrow();
    });
  });

  describe("checkAndUpdateURLForMap", () => {
    test("should accept lowercase protocols", () => {
      expect(() => checkAndUpdateURLForMap("http://example.com")).not.toThrow();
      expect(() => checkAndUpdateURLForMap("https://example.com")).not.toThrow();
    });

    test("should accept uppercase protocols", () => {
      expect(() => checkAndUpdateURLForMap("HTTP://example.com")).not.toThrow();
      expect(() => checkAndUpdateURLForMap("HTTPS://example.com")).not.toThrow();
    });

    test("should accept mixed case protocols", () => {
      expect(() => checkAndUpdateURLForMap("Http://example.com")).not.toThrow();
      expect(() => checkAndUpdateURLForMap("Https://example.com")).not.toThrow();
    });
  });

  describe("zod url schema", () => {
    test("should accept lowercase protocols", () => {
      expect(() => url.parse("http://example.com")).not.toThrow();
      expect(() => url.parse("https://example.com")).not.toThrow();
    });

    test("should accept uppercase protocols", () => {
      expect(() => url.parse("HTTP://example.com")).not.toThrow();
      expect(() => url.parse("HTTPS://example.com")).not.toThrow();
    });

    test("should accept mixed case protocols", () => {
      expect(() => url.parse("Http://example.com")).not.toThrow();
      expect(() => url.parse("Https://example.com")).not.toThrow();
    });

    test("should reject invalid protocols", () => {
      expect(() => url.parse("ftp://example.com")).toThrow();
      expect(() => url.parse("file://example.com")).toThrow();
    });
  });
});
