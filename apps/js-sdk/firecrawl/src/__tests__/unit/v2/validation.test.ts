import { describe, test, expect } from "@jest/globals";
import { ensureValidFormats, ensureValidScrapeOptions } from "../../../v2/utils/validation";
import type { FormatOption } from "../../../v2/types";
import { z } from "zod";

describe("v2 utils: validation", () => {
  test("ensureValidFormats: plain 'json' string is invalid", () => {
    const formats: FormatOption[] = ["markdown", "json"] as unknown as FormatOption[];
    expect(() => ensureValidFormats(formats)).toThrow(/json format must be an object/i);
  });

  test("ensureValidFormats: json format requires prompt and schema", () => {
    const bad1: FormatOption[] = [{ type: "json", prompt: "p" } as any];
    const bad2: FormatOption[] = [{ type: "json", schema: {} } as any];
    expect(() => ensureValidFormats(bad1)).toThrow(/requires 'prompt' and 'schema'/i);
    expect(() => ensureValidFormats(bad2)).toThrow(/requires 'prompt' and 'schema'/i);
  });

  test("ensureValidFormats: converts zod schema to JSON schema", () => {
    const schema = z.object({ title: z.string() });
    const formats: FormatOption[] = [
      { type: "json", prompt: "extract", schema } as any,
    ];
    ensureValidFormats(formats);
    const jsonFmt = formats[0] as any;
    expect(typeof jsonFmt.schema).toBe("object");
    expect(jsonFmt.schema?.properties).toBeTruthy();
  });

  test("ensureValidFormats: screenshot quality must be non-negative number", () => {
    const formats: FormatOption[] = [
      { type: "screenshot", quality: -1 } as any,
    ];
    expect(() => ensureValidFormats(formats)).toThrow(/non-negative number/i);
  });

  test("ensureValidScrapeOptions: validates timeout and waitFor bounds", () => {
    expect(() => ensureValidScrapeOptions({ timeout: 0 })).toThrow(/timeout must be positive/i);
    expect(() => ensureValidScrapeOptions({ waitFor: -1 })).toThrow(/waitFor must be non-negative/i);
    // valid
    expect(() => ensureValidScrapeOptions({ timeout: 1000, waitFor: 0 })).not.toThrow();
  });

  test("ensureValidFormats: accepts screenshot viewport width/height", () => {
    const formats: FormatOption[] = [
      { type: "screenshot", viewport: { width: 800, height: 600 } } as any,
    ];
    expect(() => ensureValidFormats(formats)).not.toThrow();
    expect((formats[0] as any).viewport).toEqual({ width: 800, height: 600 });
  });

  test("ensureValidScrapeOptions: leaves parsers untouched", () => {
    const options = { parsers: ["pdf", "images"] as string[] } as any;
    const before = [...options.parsers];
    expect(() => ensureValidScrapeOptions(options)).not.toThrow();
    expect(options.parsers).toEqual(before);
  });
});

