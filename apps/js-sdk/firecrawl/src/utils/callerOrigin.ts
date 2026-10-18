const NODE_MODULES = "/node_modules/";

function packageOf(file: string): string | null {
  let path = file.replace(/^file:\/\//, "").replace(/\\/g, "/");
  try {
    path = decodeURIComponent(path);
  } catch {}
  const at = path.lastIndexOf(NODE_MODULES);
  if (at < 0) return null;
  const [first, second] = path.slice(at + NODE_MODULES.length).split("/");
  const name = first?.startsWith("@") ? (second ? `${first}/${second}` : "") : first;
  return name && !name.startsWith(".") ? name : null;
}

function frameFile(line: string): string | null {
  const match = /^\s*at .*?\(?((?:file:\/\/)?(?:[A-Za-z]:)?[\\/][^()]*?):\d+:\d+\)?\s*$/.exec(line);
  return match ? match[1]! : null;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
}

/**
 * Slug of the installed package that constructed the client, or null when the
 * caller is application code or detection is disabled. Never throws.
 */
export function detectCallerPackage(): string | null {
  try {
    if (process.env.FIRECRAWL_DISABLE_CALLER_ORIGIN === "1") return null;
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 50;
    let stack: string;
    try {
      stack = new Error().stack ?? "";
    } finally {
      Error.stackTraceLimit = limit;
    }
    let ownFile: string | null = null;
    let ownPackage: string | null = null;
    for (const line of stack.split("\n").slice(1)) {
      const file = frameFile(line);
      if (!file) return null;
      if (ownFile === null) {
        ownFile = file;
        ownPackage = packageOf(file);
      }
      if (file === ownFile) continue;
      const name = packageOf(file);
      if (name && name === ownPackage) continue;
      return name ? slugify(name) || null : null;
    }
  } catch {}
  return null;
}

/** Origin sent with requests: `js-sdk@<version>`, or `js-sdk.<package>@<version>` for wrapper libraries. */
export function defaultOrigin(version: string): string {
  const caller = detectCallerPackage();
  return caller ? `js-sdk.${caller}@${version}` : `js-sdk@${version}`;
}
