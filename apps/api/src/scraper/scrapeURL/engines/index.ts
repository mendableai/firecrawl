import { Meta } from "..";
import { scrapeDOCX } from "./docx";
import { scrapeURLWithFireEngineChromeCDP, scrapeURLWithFireEnginePlaywright, scrapeURLWithFireEngineTLSClient } from "./fire-engine";
import { scrapePDF } from "./pdf";
import { scrapeURLWithScrapingBee } from "./scrapingbee";

export const engines = [
    "fire-engine;chrome-cdp",
    "fire-engine;playwright",
    "fire-engine;tlsclient",
    "scrapingbee",
    "scrapingbeeLoad",
    "pdf",
    "docx",
] as const;

export const featureFlags = [
    "actions",
    "waitFor",
    "screenshot",
    "screenshot@fullScreen",
    "pdf",
    "docx",
    "atsv",
    "location",
] as const;

export type FeatureFlag = typeof featureFlags[number];

export const featureFlagOptions: {
    [F in FeatureFlag]: {
        priority: number;
    }
} = {
    "actions": { priority: 20 },
    "waitFor": { priority: 1 },
    "screenshot": { priority: 10 },
    "screenshot@fullScreen": { priority: 10 },
    "pdf": { priority: 100 },
    "docx": { priority: 100 },
    "atsv": { priority: 90 }, // NOTE: should atsv force to tlsclient? adjust priority if not
    "location": { priority: 10 },
} as const;

export type Engine = typeof engines[number];

export type EngineScrapeResult = {
    url: string;

    html: string;
    markdown?: string;
    statusCode: number;
    error?: string;

    screenshot?: string;
    actions?: {
        screenshots: string[];
    };
}

const engineHandlers: {
    [E in Engine]: (meta: Meta) => Promise<EngineScrapeResult>
} = {
    "fire-engine;chrome-cdp": scrapeURLWithFireEngineChromeCDP,
    "fire-engine;playwright": scrapeURLWithFireEnginePlaywright,
    "fire-engine;tlsclient": scrapeURLWithFireEngineTLSClient,
    "scrapingbee": scrapeURLWithScrapingBee("domcontentloaded"),
    "scrapingbeeLoad": scrapeURLWithScrapingBee("networkidle2"),
    "pdf": scrapePDF,
    "docx": scrapeDOCX,
};

export const engineOptions: {
    [E in Engine]: { 
        // A list of feature flags the engine supports.
        features: { [F in FeatureFlag]: boolean },

        // This defines the order of engines in general. The engine with the highest quality will be used the most.
        // Negative quality numbers are reserved for specialty engines, e.g. PDF and DOCX
        quality: number,
    }
} = {
    "fire-engine;chrome-cdp": {
        features: {
            "actions": true,
            "waitFor": true, // through actions transform
            "screenshot": true, // through actions transform
            "screenshot@fullScreen": true, // through actions transform
            "pdf": false,
            "docx": false,
            "atsv": false,       
            "location": true,
        },
        quality: 50,    
    },
    "fire-engine;playwright": {
        features: {
            "actions": false,
            "waitFor": true,
            "screenshot": true,
            "screenshot@fullScreen": true,
            "pdf": false,
            "docx": false,
            "atsv": false,
            "location": false,
        },
        quality: 40,
    },
    "scrapingbee": {
        features: {
            "actions": false,
            "waitFor": true,
            "screenshot": true,
            "screenshot@fullScreen": true,
            "pdf": false,
            "docx": false,
            "atsv": false,
            "location": false,
        },
        quality: 30,
    },
    "scrapingbeeLoad": {
        features: {
            "actions": false,
            "waitFor": true,
            "screenshot": true,
            "screenshot@fullScreen": true,
            "pdf": false,
            "docx": false,
            "atsv": false,
            "location": false,
        },
        quality: 29,
    },
    "fire-engine;tlsclient": {
        features: {
            "actions": false,
            "waitFor": false,
            "screenshot": false,
            "screenshot@fullScreen": false,
            "pdf": false,
            "docx": false,
            "atsv": true,
            "location": true,
        },
        quality: 10,
    },
    "pdf": {
        features: {
            "actions": false,
            "waitFor": false,
            "screenshot": false,
            "screenshot@fullScreen": false,
            "pdf": true,
            "docx": false,
            "atsv": false,
            "location": false,
        },
        quality: -10,
    },
    "docx": {
        features: {
            "actions": false,
            "waitFor": false,
            "screenshot": false,
            "screenshot@fullScreen": false,
            "pdf": false,
            "docx": true,
            "atsv": false,
            "location": false,
        },
        quality: -10,
    },
};

export function buildFallbackList(meta: Meta): {
    engine: Engine,
    unsupportedFeatures: Set<FeatureFlag>,
}[] {
    const prioritySum = [...meta.featureFlags].reduce((a, x) => a + featureFlagOptions[x].priority, 0);
    const priorityThreshold = Math.floor(prioritySum / 2);
    let selectedEngines: {
        engine: Engine,
        supportScore: number,
        unsupportedFeatures: Set<FeatureFlag>,
    }[] = [];

    const currentEngines = meta.internalOptions.forceEngine !== undefined ? [meta.internalOptions.forceEngine] : engines;

    for (const engine of currentEngines) {
        const supportedFlags = new Set([...Object.entries(engineOptions[engine].features).filter(([k, v]) => meta.featureFlags.has(k as FeatureFlag) && v === true).map(([k, _]) => k)]);
        const supportScore = [...supportedFlags].reduce((a, x) => a + featureFlagOptions[x].priority, 0);

        const unsupportedFeatures = new Set([...meta.featureFlags]);
            for (const flag of meta.featureFlags) {
                if (supportedFlags.has(flag)) {
                    unsupportedFeatures.delete(flag);
                }
            }

        if (supportScore >= priorityThreshold) {
            selectedEngines.push({ engine, supportScore, unsupportedFeatures });
            meta.logger.debug(`Engine ${engine} meets feature priority threshold`, { supportScore, prioritySum, priorityThreshold, featureFlags: [...meta.featureFlags], unsupportedFeatures });
        } else {
            meta.logger.debug(`Engine ${engine} does not meet feature priority threshold`, { supportScore, prioritySum, priorityThreshold, featureFlags: [...meta.featureFlags], unsupportedFeatures});
        }
    }

    if (selectedEngines.some(x => engineOptions[x.engine].quality > 0)) {
        selectedEngines = selectedEngines.filter(x => engineOptions[x.engine].quality > 0);
    }

    selectedEngines.sort((a,b) => b.supportScore - a.supportScore || engineOptions[b.engine].quality - engineOptions[a.engine].quality);

    return selectedEngines;
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
