import { it, expect } from "vitest";
import { isZodSchema } from "./isZodSchema";
import { z } from "zod";

it("returns true for a zod-like schema", () => {
  expect(isZodSchema(z.object({}))).toBe(true);
  expect(isZodSchema(z.string({}))).toBe(true);
});

it("returns false for a non-zod schema", () => {
  expect(isZodSchema({})).toBe(false);
});
