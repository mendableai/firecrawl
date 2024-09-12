export function getFetch(): typeof fetch {
  /**
   * Browser or Node 18+
   */
  try {
    if (typeof globalThis !== "undefined" && "fetch" in globalThis) {
      return fetch.bind(globalThis);
    }
  } catch (err) {
    
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
  return require("cross-fetch") as typeof fetch;
}