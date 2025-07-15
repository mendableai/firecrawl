import { url } from "../../../controllers/v1/types";
import { describe, it, expect } from "@jest/globals";

describe("URL Schema Validation with Special Characters", () => {
  it("should handle URLs with special characters in query parameters", () => {
    const testUrl = "https://www.boulanger.com/c/nav-filtre/televiseur?_merchant_des~boulanger|brand~lg";
    
    expect(() => url.parse(testUrl)).not.toThrow();
    
    const parsedUrl = url.parse(testUrl);
    expect(parsedUrl).toContain("_merchant_des%7Eboulanger%7Cbrand%7Elg");
  });

  it("should preserve URL structure when encoding special characters", () => {
    const testUrl = "https://example.com/path?param1=value1&param2=value~with|special&param3=normal";
    
    expect(() => url.parse(testUrl)).not.toThrow();
    
    const parsedUrl = url.parse(testUrl);
    expect(parsedUrl).toContain("example.com/path?");
    expect(parsedUrl).toContain("param1=value1");
    expect(parsedUrl).toContain("param2=value%7Ewith%7Cspecial");
    expect(parsedUrl).toContain("param3=normal");
  });

  it("should handle URLs with already encoded special characters", () => {
    const testUrl = "https://example.com/path?param=value%7Eencoded";
    
    expect(() => url.parse(testUrl)).not.toThrow();
    
    const parsedUrl = url.parse(testUrl);
    expect(parsedUrl).toContain("param=value%7Eencoded");
  });
});
