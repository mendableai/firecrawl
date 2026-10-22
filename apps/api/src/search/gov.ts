import type { Logger } from "winston";
import type { WebSearchResult } from "../lib/entities";
import { fetchGovUpstream } from "../lib/research-upstream";
import { hasCategory, type CategoryOption } from "../lib/search-query-builder";

const optionalString = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const optionalStrings = (value: unknown) => {
  const items = Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      )
    : [];
  return items.length > 0 ? items : undefined;
};

// The index's legal labels, kept only when present so unlabeled pages keep
// the plain web result shape.
function legalLabels(result: any): Partial<WebSearchResult> {
  const labels = {
    jurisdiction: optionalString(result?.jurisdiction),
    court: optionalString(result?.court),
    court_type: optionalString(result?.court_type),
    cites: optionalStrings(result?.cites),
    cited_as: optionalStrings(result?.cited_as),
    updated_at:
      Number.isSafeInteger(result?.updated_at) && result.updated_at > 0
        ? result.updated_at
        : undefined,
  };
  return Object.fromEntries(
    Object.entries(labels).filter(([, value]) => value !== undefined),
  );
}

export function wantsGovCategory(categories?: CategoryOption[]): boolean {
  return hasCategory(categories, "gov");
}

export async function searchGovCategory(
  options: {
    query: string;
    limit: number;
    teamId: string;
    timeout: number;
    zeroDataRetention: boolean;
  },
  logger: Logger,
): Promise<WebSearchResult[]> {
  try {
    const upstream = await fetchGovUpstream({
      query: options.query,
      k: options.limit,
      headers: {
        "firecrawl-team-id": options.teamId,
        "firecrawl-zero-data-retention": String(options.zeroDataRetention),
      },
      timeoutMs: options.timeout,
    });
    if (upstream === null) {
      return [];
    }
    if (!upstream.ok) {
      await upstream.body?.cancel().catch(() => {});
      logger.warn("Gov category upstream failed", { status: upstream.status });
      return [];
    }

    const body: any = await upstream.json();
    const results: any[] = Array.isArray(body?.data?.web) ? body.data.web : [];
    return results
      .slice(0, options.limit)
      .map((result, index) => ({
        url: typeof result?.url === "string" ? result.url : "",
        title:
          typeof result?.title === "string" && result.title.trim().length > 0
            ? result.title
            : typeof result?.url === "string"
              ? result.url
              : "",
        description:
          typeof result?.description === "string" ? result.description : "",
        position: index + 1,
        category: "gov",
        ...legalLabels(result),
      }))
      .filter(result => result.url.length > 0);
  } catch (error) {
    logger.warn("Gov category upstream error", { error });
    return [];
  }
}
