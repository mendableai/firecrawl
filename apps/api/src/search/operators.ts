/**
 * Query operators the search API enforces on returned results, because
 * providers apply site: combined with inurl: or intitle: inconsistently.
 */

export interface QueryOperators {
  sites: string[];
  excludedSites: string[];
  inurl: string[];
  intitle: string[];
  excludedInurl: string[];
  excludedIntitle: string[];
}

export interface OperatorPlan {
  /** The query sent to the provider. */
  query: string;
  operators: QueryOperators;
  /** inurl:/intitle: were stripped from the query and are enforced on results instead. */
  relaxed: boolean;
}

const OPERATOR_TOKEN =
  /(^|[\s(])(-?)(site|inurl|intitle):(?:"([^"]*)"|([^\s()]+))\)*/gi;

export function parseQueryOperators(query: string): QueryOperators {
  const operators: QueryOperators = {
    sites: [],
    excludedSites: [],
    inurl: [],
    intitle: [],
    excludedInurl: [],
    excludedIntitle: [],
  };
  for (const match of query.matchAll(OPERATOR_TOKEN)) {
    const value = (match[4] ?? match[5] ?? "").trim().toLowerCase();
    if (!value) continue;
    const negated = match[2] === "-";
    switch (match[3].toLowerCase()) {
      case "site": {
        const site = value.replace(/^[a-z]+:\/\//, "").replace(/\/+$/, "");
        if (site)
          (negated ? operators.excludedSites : operators.sites).push(site);
        break;
      }
      case "inurl":
        (negated ? operators.excludedInurl : operators.inurl).push(value);
        break;
      case "intitle":
        (negated ? operators.excludedIntitle : operators.intitle).push(value);
        break;
    }
  }
  return operators;
}

/**
 * Providers return empty or partly filtered results when site: is combined
 * with inurl: or intitle:, so that combination is sent as site: plus plain
 * terms and the inurl:/intitle: filters are applied to the returned results.
 */
export function planOperatorQuery(query: string): OperatorPlan {
  const operators = parseQueryOperators(query);
  const relaxed =
    operators.sites.length > 0 &&
    operators.inurl.length +
      operators.intitle.length +
      operators.excludedInurl.length +
      operators.excludedIntitle.length >
      0;
  if (!relaxed) return { query, operators, relaxed };

  const rewritten = query
    .replace(OPERATOR_TOKEN, (token, lead, negated, name, quoted, bare) => {
      if (name.toLowerCase() === "site") return token;
      if (negated) return lead;
      const closing = token.match(/\)*$/)?.[0] ?? "";
      return lead + (quoted !== undefined ? `"${quoted}"` : bare) + closing;
    })
    .replace(/\s+/g, " ")
    .trim();
  return { query: rewritten, operators, relaxed };
}

/** Hostnames from site: operators, for the provider-side domain filter. */
export function siteHostnames(sites: string[]): string[] {
  return [...new Set(sites.map(site => site.split("/")[0]).filter(Boolean))];
}

function matchesSite(url: URL, site: string): boolean {
  const slash = site.indexOf("/");
  const host = slash === -1 ? site : site.slice(0, slash);
  const path = slash === -1 ? "" : site.slice(slash);
  const hostname = url.hostname.toLowerCase();
  if (hostname !== host && !hostname.endsWith("." + host)) return false;
  return !path || url.pathname.toLowerCase().startsWith(path);
}

function decodedUrl(url: string): string {
  try {
    return decodeURI(url).toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function inUrl(url: string, term: string): boolean {
  return term.split(/\s+/).every(word => url.includes(word));
}

export function matchesQueryOperators(
  result: { url?: string | null; title?: string | null },
  plan: OperatorPlan,
): boolean {
  const { operators, relaxed } = plan;
  const filtersSites =
    operators.sites.length > 0 || operators.excludedSites.length > 0;
  if (!filtersSites && !relaxed) return true;
  if (!result.url) return false;

  let parsed: URL;
  try {
    parsed = new URL(result.url);
  } catch {
    return false;
  }
  if (operators.excludedSites.some(site => matchesSite(parsed, site))) {
    return false;
  }
  if (
    operators.sites.length > 0 &&
    !operators.sites.some(site => matchesSite(parsed, site))
  ) {
    return false;
  }
  if (!relaxed) return true;

  const url = decodedUrl(result.url);
  const title = (result.title ?? "").toLowerCase();
  return (
    operators.inurl.every(term => inUrl(url, term)) &&
    !operators.excludedInurl.some(term => inUrl(url, term)) &&
    operators.intitle.every(term => title.includes(term)) &&
    !operators.excludedIntitle.some(term => title.includes(term))
  );
}
