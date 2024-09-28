import { Meta } from "..";
import { scrapeURLWithFireEngineChromeCDP } from "./fire-engine";

export const engines = [
    "fire-engine;chrome-cdp",
    // "fire-engine;playwright",
] as const;

export const featureFlags = [
    "actions",
    "screenshot",
] as const;

export type Engine = typeof engines[number];
type FeatureFlag = typeof featureFlags[number];

export type EngineScrapeResult = {
    html: string;
    markdown?: string;
    error?: string;
    statusCode: number;
}

const engineHandlers: {
    [E in Engine]: (meta: Meta) => Promise<EngineScrapeResult>
} = {
    "fire-engine;chrome-cdp": scrapeURLWithFireEngineChromeCDP,
};

const engineFeatures: {
    [E in Engine]: { [F in FeatureFlag]: boolean }
} = {
    "fire-engine;chrome-cdp": {
        "actions": true,
        "screenshot": true,
    },
};

export function buildFallbackList(meta: Meta): Engine[] {
    // TODO: real logic
    return [...engines];
}

export async function scrapeURLWithEngine(meta: Meta, engine: Engine): Promise<EngineScrapeResult> {
    const fn = engineHandlers[engine];
    const logger = meta.logger.child({ method: fn.name ?? "scrapeURLWithEngine", engine });
    const _meta = {
        ...meta,
        logger,
    };
    
    return await fn(_meta);
}
