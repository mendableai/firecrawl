import type { Logger } from "winston";
import type { WebSearchResult } from "../lib/entities";

/** Past this, results whose candidates have not verified keep their URL. */
const PIN_BUDGET_MS = 2000;

const CHECK_TIMEOUT_MS = 1500;

/** Most results per request that get their candidates checked. */
const MAX_PINNED_RESULTS = 10;

/**
 * A 200 page smaller than this is a stub, not documentation: Hugging Face
 * answers a page missing from a version with a ~200 byte "doesn't exist" page.
 */
const MIN_PAGE_BYTES = 1024;

const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/gi;
const JDK_NAME = String.raw`(?:open)?(?:jdk|java(?:\s*se)?)[\s-]*`;
// "21", "21.0.2" or "1.8" (JDK 8).
const JDK_NUMBER = String.raw`(?:1\.(?=\d))?(\d{1,2})(?:\.0(?:\.\d+)*)?(?!\w|\.\d)`;
// Takes in every number of "Java 17 vs 21", "Java 8 to 21" or "Java 8/11/17".
const JDK_PATTERN = new RegExp(
  String.raw`\b${JDK_NAME}${JDK_NUMBER}(?:\s*(?:[,/&]|->|→|\b(?:vs|to|or|and)\b\.?)\s*(?:${JDK_NAME})?${JDK_NUMBER})*`,
  "gi",
);
const JDK_NUMBER_PATTERN = new RegExp(JDK_NUMBER, "g");
const VERSION_TOKEN = /^v?(\d+\.\d+(?:\.\d+)?)$/i;
const YEAR = /^(?:19|20)\d\d$/;
/** Words between a name and its version: "TRL version 1.10.0", "0.12 vs 0.13". */
const FILLER = /^(?:v|ver|version|release|to|vs|or|and|->|→|\/|&)$/i;
const FULL_VERSION = /^\d+\.\d+\.\d+$/;
/** A tag ("v1.7.7", "jackson-core-2.21.0") or maintenance branch ("2.x"). */
const VERSION_REF = /^(?:(?:[\w.-]+-)?v?\d+(?:\.\d+){1,2}|v?\d+(?:\.\d+)?\.x)$/;
const ASSETS_PATTERN =
  /\b(?:assets?|downloads?|checksums?|sha-?256(?:sums?)?|binar(?:y|ies))\b/i;
/** Too generic to name a package on their own ("jackson-core" is not "core"). */
const GENERIC_NAMES = new Set([
  "api",
  "client",
  "com",
  "core",
  "docs",
  "java",
  "lib",
  "org",
  "sdk",
  "server",
]);

interface VersionPin {
  /** The one JDK version from "Java 21", "JDK 21" or "Java SE 21". */
  jdk?: string;
  /** Each library version with the name just before it: ["reqwest", "0.13"]. */
  versions: Array<[name: string, version: string]>;
  /** The query asks about release assets, so releases pin to the asset list. */
  wantsAssets: boolean;
}

/** The newest release tag of a GitHub "owner/repo", once looked up. */
type LatestRelease = (repo: string) => string | undefined;

const normalizeName = (name: string) =>
  name
    .toLowerCase()
    .split("/")
    .pop()!
    .replace(/[-_.]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * The versions a query names, such as "TRL v1.10.0", "reqwest 0.13" or
 * "Java 21". A library version counts only with the name before it, and the
 * JDK only when the query names one JDK version. Years, dates, issue numbers
 * (#123) and anything inside a URL are ignored. Null when nothing is left.
 */
export function parseVersionPin(query: string): VersionPin | null {
  const jdks = new Set<string>();
  const text = query.replace(URL_PATTERN, " ").replace(JDK_PATTERN, mention => {
    for (const match of mention.matchAll(JDK_NUMBER_PATTERN)) {
      jdks.add(match[1]);
    }
    return " ";
  });

  const versions: VersionPin["versions"] = [];
  let name: string | undefined;
  for (const raw of text.split(/[\s,;()[\]{}"'`]+/)) {
    const token = raw.replace(/[.:!?]+$/, "");
    const match = VERSION_TOKEN.exec(token);
    if (match) {
      if (name && !match[1].split(".").some(part => YEAR.test(part))) {
        versions.push([name, match[1]]);
      }
    } else if (token && !FILLER.test(token)) {
      name = normalizeName(token);
    }
  }

  const jdk = jdks.size === 1 ? [...jdks][0] : undefined;
  if (!jdk && versions.length === 0) return null;
  return { jdk, versions, wantsAssets: ASSETS_PATTERN.test(text) };
}

/**
 * The one version the query names for a package ("reqwest",
 * "jackson-databind"): by its name or, for a name in parts, by one
 * distinctive part ("jackson"). Undefined when the query names none or more.
 */
function versionFor(pin: VersionPin, pkg: string): string | undefined {
  const name = normalizeName(pkg);
  const parts = name
    .split("-")
    .filter(part => part.length >= 3 && !GENERIC_NAMES.has(part));
  const found = new Set(
    pin.versions
      .filter(([queryName]) => queryName === name || parts.includes(queryName))
      .map(([, version]) => version),
  );
  return found.size === 1 ? [...found][0] : undefined;
}

/**
 * Whether a version segment or tag ("0.13.4", "v1.10.0",
 * "jackson-core-2.22.3") is the version or a release of it.
 */
function isPinnedTo(segment: string | undefined, version: string): boolean {
  const bare = segment?.replace(/^(?:[\w.-]*-)?v?(?=\d)/i, "");
  return bare === version || !!bare?.startsWith(`${version}.`);
}

const isLanguage = (segment: string | undefined) =>
  segment !== undefined && /^[a-z]{2}$/.test(segment);

function oraclePaths(segments: string[], pin: VersionPin): string[][] {
  const version = pin.jdk;
  if (!version) return [];
  let rest: string[];
  if (segments[0] === "javase" && segments[2] === "docs") {
    rest = segments.slice(3);
  } else if (
    segments[0] === "en" &&
    segments[1] === "java" &&
    segments[2] === "javase" &&
    segments[4] === "docs"
  ) {
    rest = segments.slice(5);
  } else {
    return [];
  }
  if (rest[0] !== "api" || !rest[rest.length - 1]?.endsWith(".html")) {
    return [];
  }
  // Module directories ("java.base") have dots; package directories do not.
  const module = rest[1]?.includes(".") ? rest[1] : undefined;
  const page = rest.slice(module ? 2 : 1);
  if (page.length === 0) return [];
  // JDK 11 moved the API docs under /en/ with a module directory per page.
  return Number(version) >= 11
    ? [
        [
          "en",
          "java",
          "javase",
          version,
          "docs",
          "api",
          module ?? "java.base",
          ...page,
        ],
      ]
    : [["javase", version, "docs", "api", ...page]];
}

function docsRsPaths(segments: string[], pin: VersionPin): string[][] {
  // docs.rs/<crate>/<version>/... or docs.rs/crate/<crate>/<version>/...
  const at = segments[0] === "crate" ? 2 : 1;
  const crate = segments[at - 1];
  if (
    segments.length <= at ||
    !crate ||
    ["-", "about", "releases"].includes(crate)
  ) {
    return [];
  }
  const version = versionFor(pin, crate);
  if (!version || isPinnedTo(segments[at], version)) return [];
  // docs.rs reads a partial version as a semver requirement, where "1.38" is
  // any 1.x; "~1.38" is the newest 1.38.x.
  const pinned = FULL_VERSION.test(version) ? version : `~${version}`;
  return [[...segments.slice(0, at), pinned, ...segments.slice(at + 1)]];
}

function javadocIoPaths(segments: string[], pin: VersionPin): string[][] {
  if (!["doc", "static"].includes(segments[0])) return [];
  if (segments.length < 4) return [];
  const version = versionFor(pin, segments[2]);
  if (!version || isPinnedTo(segments[3], version)) return [];
  const base = [...segments.slice(0, 3), version];
  const page = segments.slice(4);
  // A release without the module directory ("com.fasterxml.jackson.databind")
  // redirects pages under it to its index page.
  return page.length > 1 && page[0].includes(".")
    ? [
        [...base, ...page],
        [...base, ...page.slice(1)],
      ]
    : [[...base, ...page]];
}

function huggingFacePaths(segments: string[], pin: VersionPin): string[][] {
  if (segments[0] !== "docs" || !segments[1]) return [];
  const [, lib, first, second] = segments;
  const version = versionFor(pin, lib);
  if (!version || isPinnedTo(first, version)) return [];
  let language: string;
  let page: string[];
  if (isLanguage(first)) {
    language = first;
    page = segments.slice(3);
  } else if (first === "main" || /^v\d/.test(first ?? "")) {
    if (!isLanguage(second)) return [];
    language = second;
    page = segments.slice(4);
  } else if (first) {
    // The canonical URL leaves out the language: /docs/trl/sft_trainer.
    language = "en";
    page = segments.slice(2);
  } else {
    return [];
  }
  return [["docs", lib, `v${version}`, language, ...page]];
}

function gitHubPaths(
  path: string[],
  pin: VersionPin,
  latestRelease?: LatestRelease,
): string[][] {
  const segments = path[path.length - 1] === "" ? path.slice(0, -1) : path;
  const [owner, repo, kind, ref] = segments;
  if (!owner || !repo) return [];
  const version = versionFor(pin, repo);
  if (!version) return [];
  const tags = [`v${version}`, version, `${repo}-${version}`];

  if (kind === "blob" || kind === "tree") {
    if (!["main", "master", "HEAD"].includes(ref) && !VERSION_REF.test(ref)) {
      return [];
    }
    if (isPinnedTo(ref, version)) return [];
    const rest = segments.slice(4);
    if (FULL_VERSION.test(version)) {
      return tags.map(tag => [owner, repo, kind, tag, ...rest]);
    }
    // A ref can also name a branch, so a minor-only version such as 0.13
    // stands only for the newest release, when that release is a 0.13.x.
    const latest = latestRelease?.(`${owner}/${repo}`);
    return latest && isPinnedTo(latest, version)
      ? [[owner, repo, kind, latest, ...rest]]
      : [];
  }

  const isReleases =
    kind === "releases" &&
    (segments.length === 3 ||
      (segments.length === 4 && ref === "latest") ||
      (ref === "tag" && segments.length >= 5));
  if (!isReleases) return [];
  // Release pages load their assets lazily; expanded_assets lists every asset
  // with its checksum.
  const page = pin.wantsAssets ? "expanded_assets" : "tag";
  return tags.map(tag => [owner, repo, "releases", page, tag]);
}

const HOST_PATHS: Record<
  string,
  (
    segments: string[],
    pin: VersionPin,
    latestRelease?: LatestRelease,
  ) => string[][]
> = {
  "docs.oracle.com": oraclePaths,
  "docs.rs": docsRsPaths,
  "javadoc.io": javadocIoPaths,
  "huggingface.co": huggingFacePaths,
  "github.com": gitHubPaths,
};

const bareHost = (hostname: string) =>
  hostname.toLowerCase().replace(/^www\./, "");

/**
 * Version-pinned URLs for a result on a known documentation host, most likely
 * first. The package or repository comes from the URL, and the version is the
 * one the query names for it. Empty when the host is unknown, the query names
 * no version for the package, or the URL is already pinned.
 */
export function versionPinCandidates(
  url: string,
  pin: VersionPin,
  latestRelease?: LatestRelease,
): string[] {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [];
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return [];
  const paths = HOST_PATHS[bareHost(parsed.hostname)];
  if (!paths) return [];

  const segments = parsed.pathname.split("/").slice(1);
  return paths(segments, pin, latestRelease)
    .map(path => {
      const candidate = new URL(parsed);
      candidate.pathname = "/" + path.join("/");
      return candidate.toString();
    })
    .filter(candidate => candidate !== parsed.toString());
}

/**
 * Whether a redirect kept the pinned page: same host and path, except for a
 * trailing index.html and a version segment that resolves to a release
 * (docs.rs sends ~0.13 to 0.13.5). Oracle and javadoc.io redirect missing
 * pages to a landing page instead.
 */
function keepsPin(candidate: string, final: string): boolean {
  const from = new URL(candidate);
  const to = new URL(final);
  if (bareHost(from.hostname) !== bareHost(to.hostname)) return false;
  const segments = (url: URL) =>
    url.pathname
      .replace(/\/index\.html$/, "")
      .replace(/\/+$/, "")
      .split("/");
  const fromSegments = segments(from);
  const toSegments = segments(to);
  return (
    fromSegments.length === toSegments.length &&
    fromSegments.every((segment, index) => {
      const version = segment.replace(/^~/, "");
      return (
        toSegments[index] === segment ||
        (toSegments[index].startsWith(`${version}.`) &&
          /^[\d.]+$/.test(toSegments[index].slice(version.length + 1)))
      );
    })
  );
}

const checkSignal = (budget: AbortSignal) =>
  AbortSignal.any([budget, AbortSignal.timeout(CHECK_TIMEOUT_MS)]);

/**
 * The URL a candidate verifies as (where it lands, with the candidate's
 * fragment), or null when it is missing, a stub or redirects elsewhere.
 */
async function verifiedUrl(
  url: string,
  budget: AbortSignal,
): Promise<string | null> {
  const request = (method: "HEAD" | "GET") =>
    fetch(url, { method, redirect: "follow", signal: checkSignal(budget) });
  let response = await request("HEAD");
  if (response.status === 405 || response.status === 501) {
    response = await request("GET");
    await response.body?.cancel().catch(() => undefined);
  }
  const length = Number(response.headers.get("content-length"));
  const final = response.url || url;
  if (
    !response.ok ||
    (length > 0 && length < MIN_PAGE_BYTES) ||
    !keepsPin(url, final)
  ) {
    return null;
  }
  const verified = new URL(final);
  verified.hash = new URL(url).hash;
  return verified.toString();
}

/** The tag a GitHub "owner/repo"'s /releases/latest redirects to. */
async function latestReleaseTag(
  repo: string,
  budget: AbortSignal,
): Promise<string | undefined> {
  const response = await fetch(`https://github.com/${repo}/releases/latest`, {
    method: "HEAD",
    redirect: "follow",
    signal: checkSignal(budget),
  });
  const tag = /\/releases\/tag\/([^/?#]+)$/.exec(response.url)?.[1];
  return response.ok && tag ? decodeURIComponent(tag) : undefined;
}

/**
 * Points web results on known documentation hosts at the page for the version
 * the query names (e.g. Java 8 API docs to Java 21 for "Java 21 ..."), when the
 * pinned page exists. Only the first `limit` results are considered, results
 * are never added, and a result that pins to a URL already listed is dropped.
 */
export async function pinResultVersions(
  results: WebSearchResult[],
  query: string,
  limit: number,
  logger: Logger,
): Promise<WebSearchResult[]> {
  const pin = parseVersionPin(query);
  if (!pin) return results;

  const budget = AbortSignal.timeout(PIN_BUDGET_MS);
  const head = results.slice(0, limit);

  // A minor-only version pins a GitHub file only to the repository's newest
  // release, so look those up first.
  const releases = new Map<string, string | undefined>();
  for (const result of head) {
    versionPinCandidates(result.url, pin, repo => {
      releases.set(repo, undefined);
      return undefined;
    });
  }
  await Promise.all(
    [...releases.keys()].map(async repo => {
      releases.set(
        repo,
        await latestReleaseTag(repo, budget).catch(() => undefined),
      );
    }),
  );

  const planned = head
    .map((result, index) => ({
      index,
      candidates: versionPinCandidates(result.url, pin, repo =>
        releases.get(repo),
      ),
    }))
    .filter(plan => plan.candidates.length > 0)
    .slice(0, MAX_PINNED_RESULTS);
  if (planned.length === 0) return results;

  const checks = new Map<string, Promise<string | null>>();
  let verified = 0;
  let failed = 0;
  const check = (url: string) => {
    let page = checks.get(url);
    if (!page) {
      page = verifiedUrl(url, budget).then(
        found => {
          if (found) verified++;
          return found;
        },
        () => {
          failed++;
          return null;
        },
      );
      checks.set(url, page);
    }
    return page;
  };

  const pinned = new Map<number, string>();
  await Promise.all(
    planned.map(async ({ index, candidates }) => {
      const pages = await Promise.all(candidates.map(check));
      const url = pages.find(page => page !== null);
      if (url) pinned.set(index, url);
    }),
  );

  // Keep unpinned duplicates as the provider returned them; drop a result only
  // when it or the earlier result with its URL was pinned.
  const seen = new Map<string, boolean>();
  const kept: WebSearchResult[] = [];
  results.forEach((result, index) => {
    const url = pinned.get(index) ?? result.url;
    const isPinned = pinned.has(index);
    if (seen.has(url) && (isPinned || seen.get(url))) return;
    if (!seen.has(url)) seen.set(url, isPinned);
    kept.push(isPinned ? { ...result, url } : result);
  });

  logger.info("Search version pin applied", {
    releases: releases.size,
    candidates: planned.length,
    checks: checks.size,
    verified,
    failed,
    rewritten: pinned.size,
    deduped: results.length - kept.length,
  });
  return kept;
}
