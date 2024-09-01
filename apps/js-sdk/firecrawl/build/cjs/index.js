"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrawlWatcher = void 0;
const axios_1 = __importDefault(require("axios"));
const zod_to_json_schema_1 = require("zod-to-json-schema");
const isows_1 = require("isows");
const typescript_event_target_1 = require("typescript-event-target");
/**
 * Main class for interacting with the Firecrawl API.
 * Provides methods for scraping, searching, crawling, and mapping web content.
 */
class FirecrawlApp {
    /**
     * Initializes a new instance of the FirecrawlApp class.
     * @param config - Configuration options for the FirecrawlApp instance.
     */
    constructor({ apiKey = null, apiUrl = null }) {
        this.apiKey = apiKey || "";
        this.apiUrl = apiUrl || "https://api.firecrawl.dev";
    }
    /**
     * Scrapes a URL using the Firecrawl API.
     * @param url - The URL to scrape.
     * @param params - Additional parameters for the scrape request.
     * @returns The response from the scrape operation.
     */
    async scrapeUrl(url, params) {
        const headers = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
        };
        let jsonData = { url, ...params };
        if (jsonData?.extract?.schema) {
            let schema = jsonData.extract.schema;
            // Try parsing the schema as a Zod schema
            try {
                schema = (0, zod_to_json_schema_1.zodToJsonSchema)(schema);
            }
            catch (error) {
            }
            jsonData = {
                ...jsonData,
                extract: {
                    ...jsonData.extract,
                    schema: schema,
                },
            };
        }
        try {
            const response = await axios_1.default.post(this.apiUrl + `/v1/scrape`, jsonData, { headers });
            if (response.status === 200) {
                const responseData = response.data;
                if (responseData.success) {
                    return {
                        success: true,
                        warning: responseData.warning,
                        error: responseData.error,
                        ...responseData.data
                    };
                }
                else {
                    throw new Error(`Failed to scrape URL. Error: ${responseData.error}`);
                }
            }
            else {
                this.handleError(response, "scrape URL");
            }
        }
        catch (error) {
            throw new Error(error.message);
        }
        return { success: false, error: "Internal server error." };
    }
    /**
     * This method is intended to search for a query using the Firecrawl API. However, it is not supported in version 1 of the API.
     * @param query - The search query string.
     * @param params - Additional parameters for the search.
     * @returns Throws an error advising to use version 0 of the API.
     */
    async search(query, params) {
        throw new Error("Search is not supported in v1, please update FirecrawlApp() initialization to use v0.");
    }
    /**
     * Initiates a crawl job for a URL using the Firecrawl API.
     * @param url - The URL to crawl.
     * @param params - Additional parameters for the crawl request.
     * @param pollInterval - Time in seconds for job status checks.
     * @param idempotencyKey - Optional idempotency key for the request.
     * @returns The response from the crawl operation.
     */
    async crawlUrl(url, params, pollInterval = 2, idempotencyKey) {
        const headers = this.prepareHeaders(idempotencyKey);
        let jsonData = { url, ...params };
        try {
            const response = await this.postRequest(this.apiUrl + `/v1/crawl`, jsonData, headers);
            if (response.status === 200) {
                const id = response.data.id;
                return this.monitorJobStatus(id, headers, pollInterval);
            }
            else {
                this.handleError(response, "start crawl job");
            }
        }
        catch (error) {
            if (error.response?.data?.error) {
                throw new Error(`Request failed with status code ${error.response.status}. Error: ${error.response.data.error} ${error.response.data.details ? ` - ${JSON.stringify(error.response.data.details)}` : ''}`);
            }
            else {
                throw new Error(error.message);
            }
        }
        return { success: false, error: "Internal server error." };
    }
    async asyncCrawlUrl(url, params, idempotencyKey) {
        const headers = this.prepareHeaders(idempotencyKey);
        let jsonData = { url, ...params };
        try {
            const response = await this.postRequest(this.apiUrl + `/v1/crawl`, jsonData, headers);
            if (response.status === 200) {
                return response.data;
            }
            else {
                this.handleError(response, "start crawl job");
            }
        }
        catch (error) {
            if (error.response?.data?.error) {
                throw new Error(`Request failed with status code ${error.response.status}. Error: ${error.response.data.error} ${error.response.data.details ? ` - ${JSON.stringify(error.response.data.details)}` : ''}`);
            }
            else {
                throw new Error(error.message);
            }
        }
        return { success: false, error: "Internal server error." };
    }
    /**
     * Checks the status of a crawl job using the Firecrawl API.
     * @param id - The ID of the crawl operation.
     * @returns The response containing the job status.
     */
    async checkCrawlStatus(id) {
        if (!id) {
            throw new Error("No crawl ID provided");
        }
        const headers = this.prepareHeaders();
        try {
            const response = await this.getRequest(`${this.apiUrl}/v1/crawl/${id}`, headers);
            if (response.status === 200) {
                return ({
                    success: true,
                    status: response.data.status,
                    total: response.data.total,
                    completed: response.data.completed,
                    creditsUsed: response.data.creditsUsed,
                    expiresAt: new Date(response.data.expiresAt),
                    next: response.data.next,
                    data: response.data.data,
                    error: response.data.error
                });
            }
            else {
                this.handleError(response, "check crawl status");
            }
        }
        catch (error) {
            throw new Error(error.message);
        }
        return { success: false, error: "Internal server error." };
    }
    async crawlUrlAndWatch(url, params, idempotencyKey) {
        const crawl = await this.asyncCrawlUrl(url, params, idempotencyKey);
        if (crawl.success && crawl.id) {
            const id = crawl.id;
            return new CrawlWatcher(id, this);
        }
        throw new Error("Crawl job failed to start");
    }
    async mapUrl(url, params) {
        const headers = this.prepareHeaders();
        let jsonData = { url, ...params };
        try {
            const response = await this.postRequest(this.apiUrl + `/v1/map`, jsonData, headers);
            if (response.status === 200) {
                return response.data;
            }
            else {
                this.handleError(response, "map");
            }
        }
        catch (error) {
            throw new Error(error.message);
        }
        return { success: false, error: "Internal server error." };
    }
    /**
     * Prepares the headers for an API request.
     * @param idempotencyKey - Optional key to ensure idempotency.
     * @returns The prepared headers.
     */
    prepareHeaders(idempotencyKey) {
        return {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
            ...(idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {}),
        };
    }
    /**
     * Sends a POST request to the specified URL.
     * @param url - The URL to send the request to.
     * @param data - The data to send in the request.
     * @param headers - The headers for the request.
     * @returns The response from the POST request.
     */
    postRequest(url, data, headers) {
        return axios_1.default.post(url, data, { headers });
    }
    /**
     * Sends a GET request to the specified URL.
     * @param url - The URL to send the request to.
     * @param headers - The headers for the request.
     * @returns The response from the GET request.
     */
    getRequest(url, headers) {
        return axios_1.default.get(url, { headers });
    }
    /**
     * Monitors the status of a crawl job until completion or failure.
     * @param id - The ID of the crawl operation.
     * @param headers - The headers for the request.
     * @param checkInterval - Interval in seconds for job status checks.
     * @param checkUrl - Optional URL to check the status (used for v1 API)
     * @returns The final job status or data.
     */
    async monitorJobStatus(id, headers, checkInterval) {
        while (true) {
            const statusResponse = await this.getRequest(`${this.apiUrl}/v1/crawl/${id}`, headers);
            if (statusResponse.status === 200) {
                const statusData = statusResponse.data;
                if (statusData.status === "completed") {
                    if ("data" in statusData) {
                        return statusData;
                    }
                    else {
                        throw new Error("Crawl job completed but no data was returned");
                    }
                }
                else if (["active", "paused", "pending", "queued", "scraping"].includes(statusData.status)) {
                    checkInterval = Math.max(checkInterval, 2);
                    await new Promise((resolve) => setTimeout(resolve, checkInterval * 1000));
                }
                else {
                    throw new Error(`Crawl job failed or was stopped. Status: ${statusData.status}`);
                }
            }
            else {
                this.handleError(statusResponse, "check crawl status");
            }
        }
    }
    /**
     * Handles errors from API responses.
     * @param {AxiosResponse} response - The response from the API.
     * @param {string} action - The action being performed when the error occurred.
     */
    handleError(response, action) {
        if ([402, 408, 409, 500].includes(response.status)) {
            const errorMessage = response.data.error || "Unknown error occurred";
            throw new Error(`Failed to ${action}. Status code: ${response.status}. Error: ${errorMessage}`);
        }
        else {
            throw new Error(`Unexpected error occurred while trying to ${action}. Status code: ${response.status}`);
        }
    }
}
exports.default = FirecrawlApp;
class CrawlWatcher extends typescript_event_target_1.TypedEventTarget {
    constructor(id, app) {
        super();
        this.ws = new isows_1.WebSocket(`${app.apiUrl}/v1/crawl/${id}`, app.apiKey);
        this.status = "scraping";
        this.data = [];
        const messageHandler = (msg) => {
            if (msg.type === "done") {
                this.status = "completed";
                this.dispatchTypedEvent("done", new CustomEvent("done", {
                    detail: {
                        status: this.status,
                        data: this.data,
                    },
                }));
            }
            else if (msg.type === "error") {
                this.status = "failed";
                this.dispatchTypedEvent("error", new CustomEvent("error", {
                    detail: {
                        status: this.status,
                        data: this.data,
                        error: msg.error,
                    },
                }));
            }
            else if (msg.type === "catchup") {
                this.status = msg.data.status;
                this.data.push(...(msg.data.data ?? []));
                for (const doc of this.data) {
                    this.dispatchTypedEvent("document", new CustomEvent("document", {
                        detail: doc,
                    }));
                }
            }
            else if (msg.type === "document") {
                this.dispatchTypedEvent("document", new CustomEvent("document", {
                    detail: msg.data,
                }));
            }
        };
        this.ws.onmessage = ((ev) => {
            if (typeof ev.data !== "string") {
                this.ws.close();
                return;
            }
            const msg = JSON.parse(ev.data);
            messageHandler(msg);
        }).bind(this);
        this.ws.onclose = ((ev) => {
            const msg = JSON.parse(ev.reason);
            messageHandler(msg);
        }).bind(this);
        this.ws.onerror = ((_) => {
            this.status = "failed";
            this.dispatchTypedEvent("error", new CustomEvent("error", {
                detail: {
                    status: this.status,
                    data: this.data,
                    error: "WebSocket error",
                },
            }));
        }).bind(this);
    }
    close() {
        this.ws.close();
    }
}
exports.CrawlWatcher = CrawlWatcher;
