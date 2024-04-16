import axios, { AxiosResponse, AxiosRequestHeaders } from 'axios';
import dotenv from 'dotenv';
dotenv.config();

interface FirecrawlAppConfig {
  apiKey?: string | null;
}

interface Params {
  [key: string]: any;
}

export default class FirecrawlApp {
  private apiKey: string;

  constructor({ apiKey = null }: FirecrawlAppConfig) {
    this.apiKey = apiKey || process.env.FIRECRAWL_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('No API key provided');
    }
  }

  async scrapeUrl(url: string, params: Params | null = null): Promise<any> {
    const headers: AxiosRequestHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    } as AxiosRequestHeaders;
    let jsonData: Params = { url };
    if (params) {
      jsonData = { ...jsonData, ...params };
    }
    try {
      const response: AxiosResponse = await axios.post('https://api.firecrawl.dev/v0/scrape', jsonData, { headers });
      if (response.status === 200) {
        const responseData = response.data;
        if (responseData.success) {
          return responseData.data;
        } else {
          throw new Error(`Failed to scrape URL. Error: ${responseData.error}`);
        }
      } else {
        this.handleError(response, 'scrape URL');
      }
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  async crawlUrl(url: string, params: Params | null = null, waitUntilDone: boolean = true, timeout: number = 2): Promise<any> {
    const headers = this.prepareHeaders();
    let jsonData: Params = { url };
    if (params) {
      jsonData = { ...jsonData, ...params };
    }
    try {
      const response: AxiosResponse = await this.postRequest('https://api.firecrawl.dev/v0/crawl', jsonData, headers);
      if (response.status === 200) {
        const jobId: string = response.data.jobId;
        if (waitUntilDone) {
          return this.monitorJobStatus(jobId, headers, timeout);
        } else {
          return { jobId };
        }
      } else {
        this.handleError(response, 'start crawl job');
      }
    } catch (error: any) {
      console.log(error)
      throw new Error(error.message);
    }
  }

  async checkCrawlStatus(jobId: string): Promise<any> {
    const headers: AxiosRequestHeaders = this.prepareHeaders();
    try {
      const response: AxiosResponse = await this.getRequest(`https://api.firecrawl.dev/v0/crawl/status/${jobId}`, headers);
      if (response.status === 200) {
        return response.data;
      } else {
        this.handleError(response, 'check crawl status');
      }
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  prepareHeaders(): AxiosRequestHeaders {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    } as AxiosRequestHeaders;
  }

  postRequest(url: string, data: Params, headers: AxiosRequestHeaders): Promise<AxiosResponse> {
    return axios.post(url, data, { headers });
  }

  getRequest(url: string, headers: AxiosRequestHeaders): Promise<AxiosResponse> {
    return axios.get(url, { headers });
  }

  async monitorJobStatus(jobId: string, headers: AxiosRequestHeaders, timeout: number): Promise<any> {
    while (true) {
      const statusResponse: AxiosResponse = await this.getRequest(`https://api.firecrawl.dev/v0/crawl/status/${jobId}`, headers);
      if (statusResponse.status === 200) {
        const statusData = statusResponse.data;
        if (statusData.status === 'completed') {
          if ('data' in statusData) {
            return statusData.data;
          } else {
            throw new Error('Crawl job completed but no data was returned');
          }
        } else if (['active', 'paused', 'pending', 'queued'].includes(statusData.status)) {
          if (timeout < 2) {
            timeout = 2;
          }
          await new Promise(resolve => setTimeout(resolve, timeout * 1000)); // Wait for the specified timeout before checking again
        } else {
          throw new Error(`Crawl job failed or was stopped. Status: ${statusData.status}`);
        }
      } else {
        this.handleError(statusResponse, 'check crawl status');
      }
    }
  }

  handleError(response: AxiosResponse, action: string): void {
    if ([402, 409, 500].includes(response.status)) {
      const errorMessage: string = response.data.error || 'Unknown error occurred';
      throw new Error(`Failed to ${action}. Status code: ${response.status}. Error: ${errorMessage}`);
    } else {
      throw new Error(`Unexpected error occurred while trying to ${action}. Status code: ${response.status}`);
    }
  }
}