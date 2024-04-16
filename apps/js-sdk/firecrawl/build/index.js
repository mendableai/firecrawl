var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();
export default class FirecrawlApp {
    constructor({ apiKey = null }) {
        this.apiKey = apiKey || process.env.FIRECRAWL_API_KEY || '';
        if (!this.apiKey) {
            throw new Error('No API key provided');
        }
    }
    scrapeUrl(url_1) {
        return __awaiter(this, arguments, void 0, function* (url, params = null) {
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            };
            let jsonData = { url };
            if (params) {
                jsonData = Object.assign(Object.assign({}, jsonData), params);
            }
            try {
                const response = yield axios.post('https://api.firecrawl.dev/v0/scrape', jsonData, { headers });
                if (response.status === 200) {
                    const responseData = response.data;
                    if (responseData.success) {
                        return responseData.data;
                    }
                    else {
                        throw new Error(`Failed to scrape URL. Error: ${responseData.error}`);
                    }
                }
                else {
                    this.handleError(response, 'scrape URL');
                }
            }
            catch (error) {
                throw new Error(error.message);
            }
        });
    }
    crawlUrl(url_1) {
        return __awaiter(this, arguments, void 0, function* (url, params = null, waitUntilDone = true, timeout = 2) {
            const headers = this.prepareHeaders();
            let jsonData = { url };
            if (params) {
                jsonData = Object.assign(Object.assign({}, jsonData), params);
            }
            try {
                const response = yield this.postRequest('https://api.firecrawl.dev/v0/crawl', jsonData, headers);
                if (response.status === 200) {
                    const jobId = response.data.jobId;
                    if (waitUntilDone) {
                        return this.monitorJobStatus(jobId, headers, timeout);
                    }
                    else {
                        return { jobId };
                    }
                }
                else {
                    this.handleError(response, 'start crawl job');
                }
            }
            catch (error) {
                console.log(error);
                throw new Error(error.message);
            }
        });
    }
    checkCrawlStatus(jobId) {
        return __awaiter(this, void 0, void 0, function* () {
            const headers = this.prepareHeaders();
            try {
                const response = yield this.getRequest(`https://api.firecrawl.dev/v0/crawl/status/${jobId}`, headers);
                if (response.status === 200) {
                    return response.data;
                }
                else {
                    this.handleError(response, 'check crawl status');
                }
            }
            catch (error) {
                throw new Error(error.message);
            }
        });
    }
    prepareHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
        };
    }
    postRequest(url, data, headers) {
        return axios.post(url, data, { headers });
    }
    getRequest(url, headers) {
        return axios.get(url, { headers });
    }
    monitorJobStatus(jobId, headers, timeout) {
        return __awaiter(this, void 0, void 0, function* () {
            while (true) {
                const statusResponse = yield this.getRequest(`https://api.firecrawl.dev/v0/crawl/status/${jobId}`, headers);
                if (statusResponse.status === 200) {
                    const statusData = statusResponse.data;
                    if (statusData.status === 'completed') {
                        if ('data' in statusData) {
                            return statusData.data;
                        }
                        else {
                            throw new Error('Crawl job completed but no data was returned');
                        }
                    }
                    else if (['active', 'paused', 'pending', 'queued'].includes(statusData.status)) {
                        if (timeout < 2) {
                            timeout = 2;
                        }
                        yield new Promise(resolve => setTimeout(resolve, timeout * 1000)); // Wait for the specified timeout before checking again
                    }
                    else {
                        throw new Error(`Crawl job failed or was stopped. Status: ${statusData.status}`);
                    }
                }
                else {
                    this.handleError(statusResponse, 'check crawl status');
                }
            }
        });
    }
    handleError(response, action) {
        if ([402, 409, 500].includes(response.status)) {
            const errorMessage = response.data.error || 'Unknown error occurred';
            throw new Error(`Failed to ${action}. Status code: ${response.status}. Error: ${errorMessage}`);
        }
        else {
            throw new Error(`Unexpected error occurred while trying to ${action}. Status code: ${response.status}`);
        }
    }
}
