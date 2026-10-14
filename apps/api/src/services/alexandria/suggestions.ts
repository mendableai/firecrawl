import { config } from "../../config";
import { exchangeRequest } from "./client";

export type ExchangeUrlSuggestion = {
  provider: string;
  name: string;
  capability: string;
  label: string;
  relationship: "owned" | "related";
  group: "alternative" | "complementary" | "broader_search";
  reason?: string;
  instructions?: string;
  input?: Record<string, string>;
  creditsCost?: number;
  contractPath: string;
};

export type ExchangeUrlSuggestions = {
  suggestions: ExchangeUrlSuggestion[];
  message: string;
};

/**
 * Exchange capabilities that can return a URL's data instead of scraping it
 * (`GET /v1/discover/suggestions`). Fails open: any error, timeout or empty
 * answer returns undefined so a caller never changes its own outcome.
 */
export async function exchangeUrlSuggestions(input: {
  teamId: string;
  url: string;
  timeoutMs?: number;
}): Promise<ExchangeUrlSuggestions | undefined> {
  if (!config.FIRE_EXCHANGE_URL) return undefined;
  try {
    const response = await exchangeRequest({
      teamId: input.teamId,
      path: `/v1/discover/suggestions?${new URLSearchParams({ url: input.url })}`,
      timeoutMs: input.timeoutMs ?? 1500,
    });
    if (response.status !== 200) return undefined;
    const body = response.body as {
      suggestions?: unknown;
      message?: unknown;
    } | null;
    if (
      !body ||
      !Array.isArray(body.suggestions) ||
      body.suggestions.length === 0 ||
      typeof body.message !== "string"
    )
      return undefined;
    return {
      suggestions: (body.suggestions as ExchangeUrlSuggestion[]).map(
        suggestion => ({
          ...suggestion,
          contractPath: suggestion.contractPath?.replace(
            /^\/v1\/discover\//,
            "/exchange/discover/",
          ),
        }),
      ),
      message: body.message,
    };
  } catch {
    return undefined;
  }
}
