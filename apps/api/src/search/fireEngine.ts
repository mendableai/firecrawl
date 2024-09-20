import axios from "axios";
import dotenv from "dotenv";
import { SearchResult } from "../../src/lib/entities";
import * as Sentry from "@sentry/node";
import { Logger } from "../lib/logger";

dotenv.config();

export async function fireEngineMap(
  q: string,
  options: {
    tbs?: string;
    filter?: string;
    lang?: string;
    country?: string;
    location?: string;
    numResults: number;
    page?: number;
  }
): Promise<SearchResult[]> {
  try {
    let data = JSON.stringify({
      query: q,
      lang: options.lang,
      country: options.country,
      location: options.location,
      tbs: options.tbs,
      numResults: options.numResults,
      page: options.page ?? 1,
    });

    if (!process.env.FIRE_ENGINE_BETA_URL) {
      console.warn(
        "(v1/map Beta) Results might differ from cloud offering currently."
      );
      return [];
    }

    let config = {
      method: "POST",
      url: `${process.env.FIRE_ENGINE_BETA_URL}/search`,
      headers: {
        "Content-Type": "application/json",
      },
      data: data,
    };
    const response = await axios(config);
    if (response && response) {
      return response.data;
    } else {
      return [];
    }
  } catch (error) {
    Logger.error(error);
    Sentry.captureException(error);
    return [];
  }
}
