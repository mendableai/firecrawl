import * as undici from "undici";
import { EngineScrapeResult } from "..";
import { Meta } from "../..";
import { TimeoutError } from "../../error";
import { specialtyScrapeCheck } from "../utils/specialtyHandler";
import {
  InsecureConnectionError,
  makeSecureDispatcher,
} from "../utils/safeFetch";

export async function scrapeURLWithFetch(
  meta: Meta,
  timeToRun: number | undefined,
): Promise<EngineScrapeResult> {
  const timeout = timeToRun ?? 300000;

  let response: undici.Response;
  try {
    response = await Promise.race([
      undici.fetch(meta.url, {
        dispatcher: await makeSecureDispatcher(meta.url),
        redirect: "follow",
        headers: meta.options.headers,
      }),
      (async () => {
        await new Promise((resolve) =>
          setTimeout(() => resolve(null), timeout),
        );
        throw new TimeoutError(
          "Fetch was unable to scrape the page before timing out",
          { cause: { timeout } },
        );
      })(),
    ]);
  } catch (error) {
    if (
      error instanceof TypeError &&
      error.cause instanceof InsecureConnectionError
    ) {
      throw error.cause;
    } else {
      throw error;
    }
  }

  specialtyScrapeCheck(
    meta.logger.child({ method: "scrapeURLWithFetch/specialtyScrapeCheck" }),
    Object.fromEntries(response.headers as any),
  );

  return {
    url: response.url,
    html: await response.text(),
    statusCode: response.status,
    // TODO: error?
  };
}
