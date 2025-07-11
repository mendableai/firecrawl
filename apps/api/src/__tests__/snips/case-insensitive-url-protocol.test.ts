import { protocolIncluded, checkAndUpdateURL, checkUrl, checkAndUpdateURLForMap } from "../../lib/validateUrl";
import { url } from "../../controllers/v1/types";

it("protocolIncluded should detect lowercase protocols", () => {
  expect(protocolIncluded("http://example.com")).toBe(true);
  expect(protocolIncluded("https://example.com")).toBe(true);
});

it("protocolIncluded should detect uppercase protocols", () => {
  expect(protocolIncluded("HTTP://example.com")).toBe(true);
  expect(protocolIncluded("HTTPS://example.com")).toBe(true);
});

it("protocolIncluded should detect mixed case protocols", () => {
  expect(protocolIncluded("Http://example.com")).toBe(true);
  expect(protocolIncluded("Https://example.com")).toBe(true);
  expect(protocolIncluded("HtTpS://example.com")).toBe(true);
});

it("protocolIncluded should return false for URLs without protocols", () => {
  expect(protocolIncluded("example.com")).toBe(false);
  expect(protocolIncluded("www.example.com")).toBe(false);
});

it("checkAndUpdateURL should accept lowercase protocols", () => {
  expect(() => checkAndUpdateURL("http://example.com")).not.toThrow();
  expect(() => checkAndUpdateURL("https://example.com")).not.toThrow();
});

it("checkAndUpdateURL should accept uppercase protocols", () => {
  expect(() => checkAndUpdateURL("HTTP://example.com")).not.toThrow();
  expect(() => checkAndUpdateURL("HTTPS://example.com")).not.toThrow();
});

it("checkAndUpdateURL should accept mixed case protocols", () => {
  expect(() => checkAndUpdateURL("Http://example.com")).not.toThrow();
  expect(() => checkAndUpdateURL("Https://example.com")).not.toThrow();
});

it("checkUrl should accept lowercase protocols", () => {
  expect(() => checkUrl("http://example.com")).not.toThrow();
  expect(() => checkUrl("https://example.com")).not.toThrow();
});

it("checkUrl should accept uppercase protocols", () => {
  expect(() => checkUrl("HTTP://example.com")).not.toThrow();
  expect(() => checkUrl("HTTPS://example.com")).not.toThrow();
});

it("checkUrl should accept mixed case protocols", () => {
  expect(() => checkUrl("Http://example.com")).not.toThrow();
  expect(() => checkUrl("Https://example.com")).not.toThrow();
});

it("checkAndUpdateURLForMap should accept lowercase protocols", () => {
  expect(() => checkAndUpdateURLForMap("http://example.com")).not.toThrow();
  expect(() => checkAndUpdateURLForMap("https://example.com")).not.toThrow();
});

it("checkAndUpdateURLForMap should accept uppercase protocols", () => {
  expect(() => checkAndUpdateURLForMap("HTTP://example.com")).not.toThrow();
  expect(() => checkAndUpdateURLForMap("HTTPS://example.com")).not.toThrow();
});

it("checkAndUpdateURLForMap should accept mixed case protocols", () => {
  expect(() => checkAndUpdateURLForMap("Http://example.com")).not.toThrow();
  expect(() => checkAndUpdateURLForMap("Https://example.com")).not.toThrow();
});

it("zod url schema should accept lowercase protocols", () => {
  expect(() => url.parse("http://example.com")).not.toThrow();
  expect(() => url.parse("https://example.com")).not.toThrow();
});

it("zod url schema should accept uppercase protocols", () => {
  expect(() => url.parse("HTTP://example.com")).not.toThrow();
  expect(() => url.parse("HTTPS://example.com")).not.toThrow();
});

it("zod url schema should accept mixed case protocols", () => {
  expect(() => url.parse("Http://example.com")).not.toThrow();
  expect(() => url.parse("Https://example.com")).not.toThrow();
});

it("zod url schema should reject invalid protocols", () => {
  expect(() => url.parse("ftp://example.com")).toThrow();
  expect(() => url.parse("file://example.com")).toThrow();
});
