import { z } from "zod";
import type { Logger } from "winston";
import { exchangeRequest } from "../services/alexandria/client";
import {
  toolSchema,
  toolSummarySchema,
  type DiscoveredTool,
  type DetailedDiscoveredTool,
} from "../services/alexandria/contracts";

export const isAlexandriaSource = (source: { type: string }) =>
  source.type === "alexandria";
type ToolDiscovery = {
  items: DiscoveredTool[];
  warning?: string;
  /** Every discovery leg failed and nothing was found. */
  unavailable?: true;
};

type SourceLike = string | { type: string };
type CategoryLike = string | { type: string };

const typeOf = (value: SourceLike | CategoryLike) =>
  typeof value === "string" ? value : value?.type;

export function isToolsOnlySearch(
  sources: unknown,
  categories: unknown,
): boolean {
  if (!Array.isArray(sources) || sources.length === 0) return false;
  if (!sources.every(source => typeOf(source) === "alexandria")) return false;
  if (
    Array.isArray(categories) &&
    categories.some(category => {
      const type = typeOf(category);
      return type === "developer" || type === "gov";
    })
  )
    return false;
  return true;
}

export async function discoverTools(
  input: {
    teamId: string;
    toolDetail?: "compact" | "summary" | "full";
    /** Runs semantic discovery and ranks domain matches. */
    query?: string;
    /** Ranks domain matches without running semantic discovery. */
    rankQuery?: string;
    urls?: string[];
    limit: number;
    timeoutMs: number;
    /** The team may use its own MCP connectors: their listed tools join its discovery. */
    connectors?: boolean;
  },
  logger: Logger,
): Promise<ToolDiscovery> {
  const deadline = Date.now() + Math.min(10000, input.timeoutMs);
  const items = new Map<string, DetailedDiscoveredTool>();
  const selected = { semantic: new Set<string>(), domain: new Set<string>() };
  let attempted = 0;
  let answered = 0;
  const remaining = () => {
    if (Date.now() >= deadline) throw new Error("Tool discovery timed out");
    return deadline - Date.now();
  };
  const lookup = async (options: Record<string, unknown>) => {
    const result = await exchangeRequest({
      teamId: input.teamId,
      path: "/v1/retrieve",
      timeoutMs: remaining(),
      maximumCredits: 0,
      connectors: input.connectors === true,
      body: {
        provider: "firecrawl",
        capability: "find-tools",
        options: {
          ...options,
          level: "tools",
          expand:
            input.toolDetail === "full"
              ? ["options", "response", "examples"]
              : [],
          limit: Math.min(input.limit, 24),
        },
      },
    });
    if (result.status !== 200)
      throw new Error("Tool contract lookup unavailable");
    return z
      .object({
        success: z.literal(true),
        creditsCost: z.literal(0),
        data: z.object({
          items: z.array(
            input.toolDetail === "full" ? toolSchema : toolSummarySchema,
          ),
        }),
      })
      .parse(result.body).data.items;
  };
  type Tool = Awaited<ReturnType<typeof lookup>>[number];
  const merge = (
    tool: Tool,
    source: "semantic" | "domain",
    urls: string[] = [],
  ) => {
    const id = `${tool.provider}/${tool.capability}`;
    const previous = items.get(id);
    if (
      !selected[source].has(id) &&
      selected[source].size >= Math.min(input.limit, 24)
    )
      return;
    selected[source].add(id);
    if (previous) {
      items.set(id, {
        ...previous,
        matchedBy: [...new Set([...(previous.matchedBy ?? []), source])],
        matchedUrls: [...new Set([...(previous.matchedUrls ?? []), ...urls])],
      });
    } else {
      items.set(id, {
        ...tool,
        id,
        matchedBy: [source],
        matchedUrls: [...new Set(urls)],
      });
    }
  };
  const leg = async <T>(
    message: string,
    run: () => Promise<T>,
  ): Promise<T | undefined> => {
    attempted++;
    for (let attempt = 1; ; attempt++) {
      try {
        const value = await run();
        answered++;
        return value;
      } catch (error) {
        logger.warn(message, { error, attempt });
        if (attempt >= 2 || Date.now() >= deadline) return undefined;
      }
    }
  };
  const query = input.query;
  const semantic = query
    ? leg("Semantic tool discovery unavailable", () => lookup({ query }))
    : undefined;
  const urls = [...new Set(input.urls ?? [])].filter(value => {
    const url = URL.parse(value);
    return (
      url &&
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      value.length <= 8192
    );
  });
  const rankQuery = input.query ?? input.rankQuery;
  const domain = urls.length
    ? leg("Domain tool discovery unavailable", async () => {
        const hostOf = (value: string) =>
          new URL(value).hostname.toLowerCase().replace(/\.$/, "");
        const byProvider: { tool: Tool; urls: string[] }[][] = [];
        // Resolve domains once; Exchange owns matching and provider visibility.
        for (let i = 0; i < urls.length; i += 100) {
          const batch = urls.slice(i, i + 100);
          const result = await exchangeRequest({
            teamId: input.teamId,
            path: "/v1/skills/resolve",
            body: { urls: batch },
            timeoutMs: remaining(),
            connectors: input.connectors === true,
          });
          if (result.status !== 200)
            throw new Error("Domain discovery unavailable");
          const matches = z
            .object({
              skills: z.array(
                z.object({
                  id: z.string(),
                  matchedDomains: z.array(z.string()),
                  domainCapabilities: z
                    .record(z.string(), z.array(z.string()))
                    .optional(),
                }),
              ),
            })
            .parse(result.body).skills;
          byProvider.push(
            ...(await Promise.all(
              matches.map(async match => {
                const matchedUrls = batch.filter(value => {
                  const host = hostOf(value);
                  return (
                    match.matchedDomains.includes(host) ||
                    match.matchedDomains.includes(host.replace(/^www\./, ""))
                  );
                });
                const capabilitiesFor = (url: string) => {
                  const host = hostOf(url);
                  return [
                    ...new Set([
                      ...(match.domainCapabilities?.[url] ?? []),
                      ...(match.domainCapabilities?.[host] ?? []),
                      ...(match.domainCapabilities?.[
                        host.replace(/^www\./, "")
                      ] ?? []),
                    ]),
                  ];
                };
                const capabilities = [
                  ...new Set(matchedUrls.flatMap(capabilitiesFor)),
                ];
                if (
                  !matchedUrls.length ||
                  (match.domainCapabilities && !capabilities.length)
                )
                  return [];
                const providers = [match.id];
                // Each provider retries on its own, so one failure keeps the other matches.
                const tools =
                  (await leg("Domain tool lookup unavailable", async () => {
                    // Without a query Exchange lists a provider's tools alphabetically.
                    const ranked =
                      !capabilities.length && rankQuery
                        ? await lookup({ providers, query: rankQuery })
                        : [];
                    return ranked.length
                      ? ranked
                      : await lookup({
                          providers,
                          ...(capabilities.length ? { capabilities } : {}),
                        });
                  })) ?? [];
                return tools
                  .filter(tool => tool.provider === match.id)
                  .map(tool => ({
                    tool,
                    urls: match.domainCapabilities
                      ? matchedUrls.filter(url =>
                          capabilitiesFor(url).includes(tool.capability),
                        )
                      : matchedUrls,
                  }));
              }),
            )),
          );
        }
        // Round-robin so one large provider can't take every domain slot.
        return Array.from(
          { length: Math.max(0, ...byProvider.map(tools => tools.length)) },
          (_, rank) => byProvider.flatMap(tools => tools[rank] ?? []),
        ).flat();
      })
    : undefined;
  const [semanticTools, domainTools] = await Promise.all([semantic, domain]);
  for (const tool of semanticTools ?? []) merge(tool, "semantic");
  for (const { tool, urls } of domainTools ?? []) merge(tool, "domain", urls);
  return {
    items: [...items.values()].map(tool =>
      input.toolDetail === "compact"
        ? {
            provider: tool.provider,
            capability: tool.capability,
            description: tool.description,
          }
        : tool,
    ),
    ...(answered < attempted
      ? { warning: "Some tool discovery results are unavailable." }
      : {}),
    ...(attempted && !answered && !items.size
      ? { unavailable: true as const }
      : {}),
  };
}
