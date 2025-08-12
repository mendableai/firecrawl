export function getVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require("../../package.json");
    return (pkg?.version as string) || "3.0.0";
  } catch {
    return "3.0.0";
  }
}

