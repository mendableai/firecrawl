import { isUrlBlocked } from "../blocklist";

describe("isUrlBlocked function", () => {
  test("Blocks exact domain facebook.com", () => {
    expect(isUrlBlocked("facebook.com")).toBe(true);
    expect(isUrlBlocked("http://facebook.com")).toBe(true);
    expect(isUrlBlocked("https://facebook.com")).toBe(true);
  });

  test("Blocks subdomains of facebook.com", () => {
    expect(isUrlBlocked("www.facebook.com")).toBe(true);
    expect(isUrlBlocked("ads.facebook.com")).toBe(true);
    expect(isUrlBlocked("business.facebook.com")).toBe(true);
  });

  test("Blocks different TLDs (facebook.pt, facebook.io)", () => {
    expect(isUrlBlocked("facebook.pt")).toBe(true);
    expect(isUrlBlocked("facebook.io")).toBe(true);
    expect(isUrlBlocked("facebook.co.uk")).toBe(true);
    expect(isUrlBlocked("https://facebook.de")).toBe(true);
  });

  test("Allows unrelated domains like whateverfacebook.com", () => {
    expect(isUrlBlocked("whateverfacebook.com")).toBe(false);
    expect(isUrlBlocked("https://whateverfacebook.com")).toBe(false);
  });

  test("Blocks other domains from the blocklist", () => {
    expect(isUrlBlocked("tiktok.com")).toBe(true);
    expect(isUrlBlocked("www.tiktok.com")).toBe(true);
    expect(isUrlBlocked("reddit.com")).toBe(true);
    expect(isUrlBlocked("youtube.com")).toBe(true);
  });

  test("Allows allowed keywords URLs", () => {
    expect(isUrlBlocked("https://www.facebook.com/ads/library")).toBe(false);
    expect(isUrlBlocked("https://developers.facebook.com")).toBe(false);
    expect(isUrlBlocked("https://library.tiktok.com")).toBe(false);
  });

  test("Handles URLs with and without protocols", () => {
    expect(isUrlBlocked("facebook.com")).toBe(true);
    expect(isUrlBlocked("http://facebook.com")).toBe(true);
    expect(isUrlBlocked("https://facebook.com")).toBe(true);
    expect(isUrlBlocked("www.facebook.com")).toBe(true);
  });

  test("Should return false if the URL is invalid", () => {
    expect(isUrlBlocked("randomstring")).toBe(false);
    expect(isUrlBlocked("htp://bad.url")).toBe(false);
    expect(isUrlBlocked("")).toBe(false);
  });
});
