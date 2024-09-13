import { expect, it, vi } from "vitest";
import { getFetch } from "./getFetch";
import crossFetch from "cross-fetch";

const FETCH_MARKER = Symbol("fetch");

it("returns the global fetch if it exists", () => {
  const mock = vi.fn();
  Object.defineProperties(mock, {
    [FETCH_MARKER]: {},
  });

  globalThis.fetch = mock;

  expect((getFetch() as never)[FETCH_MARKER]).toBe(
    (mock as never)[FETCH_MARKER],
  );
});

it("returns the cross-fetch if the global fetch does not exist", () => {
  // @ts-expect-error - for the test
  delete globalThis.fetch;

  expect(getFetch()).toBe(crossFetch);
});
