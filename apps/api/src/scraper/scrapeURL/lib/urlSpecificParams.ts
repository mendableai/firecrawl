import { InternalOptions } from "..";
import { ScrapeOptions } from "../../../controllers/v1/types";

export type UrlSpecificParams = {
    scrapeOptions: Partial<ScrapeOptions>,
    internalOptions: Partial<InternalOptions>,
};

const docsParam: UrlSpecificParams = {
    scrapeOptions: {
        waitFor: 2000,
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "sec-fetch-site": "same-origin",
            "sec-fetch-mode": "cors",
            "sec-fetch-dest": "empty",
            referer: "https://www.google.com/",
            "accept-language": "en-US,en;q=0.9",
            "accept-encoding": "gzip, deflate, br",
            accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
        },
    },
    internalOptions: { forceEngine: "fire-engine;chrome-cdp" },
}

export const urlSpecificParams: Record<string, UrlSpecificParams> = {
    "support.greenpay.me": docsParam,
    "docs.pdw.co": docsParam,
    "developers.notion.com": docsParam,
    "docs2.hubitat.com": docsParam,
    "rsseau.fr": docsParam,
    "help.salesforce.com": docsParam,
    "scrapethissite.com": {
        scrapeOptions: {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "sec-fetch-site": "same-origin",
                "sec-fetch-mode": "cors",
                "sec-fetch-dest": "empty",
                referer: "https://www.google.com/",
                "accept-language": "en-US,en;q=0.9",
                "accept-encoding": "gzip, deflate, br",
                accept:
                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
            },
        },
        internalOptions: { forceEngine: "fetch" },
    },
    // "eonhealth.com": {
    //     defaultScraper: "fire-engine",
    //     params: {
    //         fireEngineOptions: {
    //             mobileProxy: true,
    //             method: "get",
    //             engine: "request",
    //         },
    //     },
    // },
    "notion.com": {
        scrapeOptions: { waitFor: 2000 },
        internalOptions: { forceEngine: "fire-engine;playwright" }
    },
    "developer.apple.com": {
        scrapeOptions: { waitFor: 2000 },
        internalOptions: { forceEngine: "fire-engine;playwright" }
    },
    "digikey.com": {
        scrapeOptions: {},
        internalOptions: { forceEngine: "fire-engine;tlsclient" }
    },
    "lorealparis.hu": {
        scrapeOptions: {},
        internalOptions: { forceEngine: "fire-engine;tlsclient" },
    }
};
