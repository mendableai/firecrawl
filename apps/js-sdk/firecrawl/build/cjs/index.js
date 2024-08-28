"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const zod_1 = require("zod");
const zod_to_json_schema_1 = require("zod-to-json-schema");
/**
 * Main class for interacting with the Firecrawl API.
 * Provides methods for scraping, searching, crawling, and mapping web content.
 */
class FirecrawlApp {
    /**
     * Initializes a new instance of the FirecrawlApp class.
     * @param config - Configuration options for the FirecrawlApp instance.
     */
    constructor({ apiKey = null, apiUrl = null, version = "v1" }) {
        this.apiKey = apiKey || "";
        this.apiUrl = apiUrl || "https://api.firecrawl.dev";
        this.version = version;
        if (!this.apiKey) {
            throw new Error("No API key provided");
        }
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
        if (jsonData?.extractorOptions?.extractionSchema) {
            let schema = jsonData.extractorOptions.extractionSchema;
            // Check if schema is an instance of ZodSchema to correctly identify Zod schemas
            if (schema instanceof zod_1.z.ZodSchema) {
                schema = (0, zod_to_json_schema_1.zodToJsonSchema)(schema);
            }
            jsonData = {
                ...jsonData,
                extractorOptions: {
                    ...jsonData.extractorOptions,
                    extractionSchema: schema,
                    mode: jsonData.extractorOptions.mode || "llm-extraction",
                },
            };
        }
        try {
            const response = await axios_1.default.post(this.apiUrl + `/${this.version}/scrape`, jsonData, { headers });
            if (response.status === 200) {
                const responseData = response.data;
                if (responseData.success) {
                    return (this.version === 'v0' ? responseData : {
                        success: true,
                        warning: responseData.warning,
                        error: responseData.error,
                        ...responseData.data
                    });
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
     * Searches for a query using the Firecrawl API.
     * @param query - The query to search for.
     * @param params - Additional parameters for the search request.
     * @returns The response from the search operation.
     */
    async search(query, params) {
        if (this.version === "v1") {
            throw new Error("Search is not supported in v1, please update FirecrawlApp() initialization to use v0.");
        }
        const headers = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
        };
        let jsonData = { query };
        if (params) {
            jsonData = { ...jsonData, ...params };
        }
        try {
            const response = await axios_1.default.post(this.apiUrl + "/v0/search", jsonData, { headers });
            if (response.status === 200) {
                const responseData = response.data;
                if (responseData.success) {
                    return responseData;
                }
                else {
                    throw new Error(`Failed to search. Error: ${responseData.error}`);
                }
            }
            else {
                this.handleError(response, "search");
            }
        }
        catch (error) {
            throw new Error(error.message);
        }
        return { success: false, error: "Internal server error." };
    }
    /**
     * Initiates a crawl job for a URL using the Firecrawl API.
     * @param url - The URL to crawl.
     * @param params - Additional parameters for the crawl request.
     * @param waitUntilDone - Whether to wait for the crawl job to complete.
     * @param pollInterval - Time in seconds for job status checks.
     * @param idempotencyKey - Optional idempotency key for the request.
     * @returns The response from the crawl operation.
     */
    async crawlUrl(url, params, waitUntilDone = true, pollInterval = 2, idempotencyKey) {
        const headers = this.prepareHeaders(idempotencyKey);
        let jsonData = { url, ...params };
        try {
            const response = await this.postRequest(this.apiUrl + `/${this.version}/crawl`, jsonData, headers);
            if (response.status === 200) {
                const id = this.version === 'v0' ? response.data.jobId : response.data.id;
                let checkUrl = undefined;
                if (waitUntilDone) {
                    if (this.version === 'v1') {
                        checkUrl = response.data.url;
                    }
                    return this.monitorJobStatus(id, headers, pollInterval, checkUrl);
                }
                else {
                    if (this.version === 'v0') {
                        return {
                            success: true,
                            jobId: id
                        };
                    }
                    else {
                        return {
                            success: true,
                            id: id
                        };
                    }
                }
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
            const response = await this.getRequest(this.version === 'v1' ?
                `${this.apiUrl}/${this.version}/crawl/${id}` :
                `${this.apiUrl}/${this.version}/crawl/status/${id}`, headers);
            if (response.status === 200) {
                if (this.version === 'v0') {
                    return {
                        success: true,
                        status: response.data.status,
                        current: response.data.current,
                        current_url: response.data.current_url,
                        current_step: response.data.current_step,
                        total: response.data.total,
                        data: response.data.data,
                        partial_data: !response.data.data
                            ? response.data.partial_data
                            : undefined,
                    };
                }
                else {
                    return {
                        success: true,
                        status: response.data.status,
                        total: response.data.total,
                        completed: response.data.completed,
                        creditsUsed: response.data.creditsUsed,
                        expiresAt: new Date(response.data.expiresAt),
                        next: response.data.next,
                        data: response.data.data,
                        error: response.data.error
                    };
                }
            }
            else {
                this.handleError(response, "check crawl status");
            }
        }
        catch (error) {
            throw new Error(error.message);
        }
        return this.version === 'v0' ?
            {
                success: false,
                status: "unknown",
                current: 0,
                current_url: "",
                current_step: "",
                total: 0,
                error: "Internal server error.",
            } :
            {
                success: false,
                error: "Internal server error.",
            };
    }
    async mapUrl(url, params) {
        if (this.version == 'v0') {
            throw new Error("Map is not supported in v0");
        }
        const headers = this.prepareHeaders();
        let jsonData = { url, ...params };
        try {
            const response = await this.postRequest(this.apiUrl + `/${this.version}/map`, jsonData, headers);
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
    async monitorJobStatus(id, headers, checkInterval, checkUrl) {
        let apiUrl = '';
        while (true) {
            if (this.version === 'v1') {
                apiUrl = checkUrl ?? `${this.apiUrl}/v1/crawl/${id}`;
            }
            else if (this.version === 'v0') {
                apiUrl = `${this.apiUrl}/v0/crawl/status/${id}`;
            }
            const statusResponse = await this.getRequest(apiUrl, headers);
            if (statusResponse.status === 200) {
                const statusData = statusResponse.data;
                if (statusData.status === "completed") {
                    if ("data" in statusData) {
                        return this.version === 'v0' ? statusData.data : statusData;
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
