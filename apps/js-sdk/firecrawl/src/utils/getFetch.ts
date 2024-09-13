/**
 * Returns the global fetch (if available) or the `cross-fetch`.
 *
 * @returns The global fetch or the `cross-fetch`
 */
export function getFetch(): typeof fetch {
  /**
   * Browser or Node 18+
   */
  try {
    if (typeof globalThis !== "undefined" && "fetch" in globalThis) {
      return fetch.bind(globalThis);
    }
  } catch {
    /* empty */
  }

  /**
   * Existing polyfilled fetch
   */
  if (typeof fetch !== "undefined") {
    return fetch;
  }

  /**
   * Environments where fetch cannot be found and must be polyfilled
   */
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("cross-fetch") as typeof fetch;
}
