import { configDotenv } from "dotenv";
configDotenv()
import { z } from "zod";
import { scrapeOptions, ScrapeOptions } from "./controllers/v1/types";
import { InternalOptions, scrapeURL, ScrapeUrlResponse } from "./scraper/scrapeURL";
import { logger as _logger } from "./lib/logger";
import { Engine, engineOptions, engines } from "./scraper/scrapeURL/engines";
import { writeFile } from "fs/promises";
import path from "path";

// inputs
const url: string = "https://firecrawl.dev";
const controlString: string | undefined = undefined;

const errorReplacer = (_, value) => {
    if (value instanceof Error) {
      return {
        ...value,
        name: value.name,
        message: value.message,
        stack: value.stack,
        cause: value.cause,
      }
    } else {
      return value;
    }
  };

const doctorId = crypto.randomUUID();
const logger = _logger.child({ module: "doctor" });

type Permutation = {
    options: z.input<typeof scrapeOptions>,
    internal: InternalOptions,
    name: string
};

const permutations: Permutation[] = [
    { options: {}, internal: {}, name: "bare" },
    ...Object.entries(engineOptions).filter(([name, options]) => options.quality > 0 && engines.includes(name as Engine)).map(([name, options]) => ({
        options: {}, internal: { forceEngine: name as Engine }, name,
    })),
];

type PermutationResult = ({
    state: "done",
    result: ScrapeUrlResponse & {
        success: true
    },
} | {
    state: "thrownError",
    error: string | Error,
} | {
    state: "error",
    result: ScrapeUrlResponse & {
        success: false
    },
}) & {
    permutation: Permutation,
};

const results: PermutationResult[] = [];

(async () => {
    await Promise.all(permutations.map(async perm => {
        logger.info("Trying permutation " + perm.name);
        try {
            const result = await scrapeURL(doctorId + ":bare", url, scrapeOptions.parse(perm.options), perm.internal);
            if (result.success) { 
                results.push({
                    state: "done",
                    result,
                    permutation: perm,
                });
            } else {
                results.push({
                    state: "error",
                    result,
                    permutation: perm,
                });
            }
        } catch (error) {
            console.error("Permutation " + perm.name + " failed with error", { error });
            results.push({
                state: "thrownError",
                error,
                permutation: perm,
            });
        }
    }));

    const fileContent = "<head><meta charset=\"utf8\"></head><body style=\"font-family: sans-serif; padding: 1rem;\"><h1>Doctor</h1><p>URL: <code>" + url + "</code></p>"
        + results.map(x => "<h2>" + (x.state === "done" ? "✅" : "❌") + " " + x.permutation.name + "</h2><p>Scrape options: <code>" + JSON.stringify(x.permutation.options) + "</code></p>"
            + "<p>Internal options: <code>" + JSON.stringify(x.permutation.internal) + "</code></p>"
            + "<code><pre>" + ((x.state === "done" ? JSON.stringify(x.result, errorReplacer, 4)
                : x.state === "thrownError" ? (x.error instanceof Error ? (x.error.message + "\n" + (x.error.stack ?? "")) : x.error) 
                : (JSON.stringify(x.result, errorReplacer, 4))))
                .replaceAll("<", "&lt;").replaceAll(">", "&gt;") + "</pre></code>").join("")
        + "</body>"

    const fileName = path.join(process.cwd(), "doctor-" + doctorId + ".html");
    await writeFile(fileName, fileContent);
    logger.info("Wrote result to " + fileName);
})();
