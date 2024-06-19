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
 */
class FirecrawlApp {
    /**
     * Initializes a new instance of the FirecrawlApp class.
     * @param {FirecrawlAppConfig} config - Configuration options for the FirecrawlApp instance.
     */
    constructor({ apiKey = null, apiUrl = null }) {
        this.apiKey = apiKey || "";
        this.apiUrl = apiUrl || "https://api.firecrawl.dev";
        if (!this.apiKey) {
            throw new Error("No API key provided");
        }
    }
    /**
     * Scrapes a URL using the Firecrawl API.
     * @param {string} url - The URL to scrape.
     * @param {Params | null} params - Additional parameters for the scrape request.
     * @returns {Promise<ScrapeResponse>} The response from the scrape operation.
     */
    async scrapeUrl(url, params = null) {
        const headers = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
        };
        let jsonData = { url, ...params };
        if (params?.extractorOptions?.extractionSchema) {
            let schema = params.extractorOptions.extractionSchema;
            // Check if schema is an instance of ZodSchema to correctly identify Zod schemas
            if (schema instanceof zod_1.z.ZodSchema) {
                schema = (0, zod_to_json_schema_1.zodToJsonSchema)(schema);
            }
            jsonData = {
                ...jsonData,
                extractorOptions: {
                    ...params.extractorOptions,
                    extractionSchema: schema,
                    mode: params.extractorOptions.mode || "llm-extraction",
                },
            };
        }
        try {
            const response = await axios_1.default.post(this.apiUrl + "/v0/scrape", jsonData, { headers });
            if (response.status === 200) {
                const responseData = response.data;
                if (responseData.success) {
                    return responseData;
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
     * @param {string} query - The query to search for.
     * @param {Params | null} params - Additional parameters for the search request.
     * @returns {Promise<SearchResponse>} The response from the search operation.
     */
    async search(query, params = null) {
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
     * @param {string} url - The URL to crawl.
     * @param {Params | null} params - Additional parameters for the crawl request.
     * @param {boolean} waitUntilDone - Whether to wait for the crawl job to complete.
     * @param {number} pollInterval - Time in seconds for job status checks.
     * @param {string} idempotencyKey - Optional idempotency key for the request.
     * @returns {Promise<CrawlResponse | any>} The response from the crawl operation.
     */
    async crawlUrl(url, params = null, waitUntilDone = true, pollInterval = 2, idempotencyKey) {
        const headers = this.prepareHeaders(idempotencyKey);
        let jsonData = { url };
        if (params) {
            jsonData = { ...jsonData, ...params };
        }
        try {
            const response = await this.postRequest(this.apiUrl + "/v0/crawl", jsonData, headers);
            if (response.status === 200) {
                const jobId = response.data.jobId;
                if (waitUntilDone) {
                    return this.monitorJobStatus(jobId, headers, pollInterval);
                }
                else {
                    return { success: true, jobId };
                }
            }
            else {
                this.handleError(response, "start crawl job");
            }
        }
        catch (error) {
            console.log(error);
            throw new Error(error.message);
        }
        return { success: false, error: "Internal server error." };
    }
    /**
     * Checks the status of a crawl job using the Firecrawl API.
     * @param {string} jobId - The job ID of the crawl operation.
     * @returns {Promise<JobStatusResponse>} The response containing the job status.
     */
    async checkCrawlStatus(jobId) {
        const headers = this.prepareHeaders();
        try {
            const response = await this.getRequest(this.apiUrl + `/v0/crawl/status/${jobId}`, headers);
            if (response.status === 200) {
                return {
                    success: true,
                    status: response.data.status,
                    data: response.data.data,
                    partial_data: !response.data.data
                        ? response.data.partial_data
                        : undefined,
                };
            }
            else {
                this.handleError(response, "check crawl status");
            }
        }
        catch (error) {
            throw new Error(error.message);
        }
        return {
            success: false,
            status: "unknown",
            error: "Internal server error.",
        };
    }
    /**
     * Prepares the headers for an API request.
     * @returns {AxiosRequestHeaders} The prepared headers.
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
     * @param {string} url - The URL to send the request to.
     * @param {Params} data - The data to send in the request.
     * @param {AxiosRequestHeaders} headers - The headers for the request.
     * @returns {Promise<AxiosResponse>} The response from the POST request.
     */
    postRequest(url, data, headers) {
        return axios_1.default.post(url, data, { headers });
    }
    /**
     * Sends a GET request to the specified URL.
     * @param {string} url - The URL to send the request to.
     * @param {AxiosRequestHeaders} headers - The headers for the request.
     * @returns {Promise<AxiosResponse>} The response from the GET request.
     */
    getRequest(url, headers) {
        return axios_1.default.get(url, { headers });
    }
    /**
     * Monitors the status of a crawl job until completion or failure.
     * @param {string} jobId - The job ID of the crawl operation.
     * @param {AxiosRequestHeaders} headers - The headers for the request.
     * @param {number} timeout - Timeout in seconds for job status checks.
     * @returns {Promise<any>} The final job status or data.
     */
    async monitorJobStatus(jobId, headers, checkInterval) {
        while (true) {
            const statusResponse = await this.getRequest(this.apiUrl + `/v0/crawl/status/${jobId}`, headers);
            if (statusResponse.status === 200) {
                const statusData = statusResponse.data;
                if (statusData.status === "completed") {
                    if ("data" in statusData) {
                        return statusData.data;
                    }
                    else {
                        throw new Error("Crawl job completed but no data was returned");
                    }
                }
                else if (["active", "paused", "pending", "queued"].includes(statusData.status)) {
                    if (checkInterval < 2) {
                        checkInterval = 2;
                    }
                    await new Promise((resolve) => setTimeout(resolve, checkInterval * 1000)); // Wait for the specified timeout before checking again
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
