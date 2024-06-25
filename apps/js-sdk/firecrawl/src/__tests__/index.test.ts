import { describe, test, expect, jest } from '@jest/globals';
import axios from 'axios';
import FirecrawlApp from '../index';

import { readFile } from 'fs/promises';
import { join } from 'path';

// Mock jest and set the type
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Get the fixure data from the JSON file in ./fixtures
async function loadFixture(name: string): Promise<string> {
  return await readFile(join(__dirname, 'fixtures', `${name}.json`), 'utf-8')
}

describe('the firecrawl JS SDK', () => {

  test('Should require an API key to instantiate FirecrawlApp', async () => {
    const fn = () => {
      new FirecrawlApp({ apiKey: undefined });
    };
    expect(fn).toThrow('No API key provided');
  });

  test('Should return scraped data from a /scrape API call', async () => {
    const mockData = await loadFixture('scrape');
    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: JSON.parse(mockData),
    });

    const apiKey = 'YOUR_API_KEY'
    const app = new FirecrawlApp({ apiKey });
    // Scrape a single URL
    const url = 'https://mendable.ai';
    const scrapedData = await app.scrapeUrl(url);

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/api.firecrawl.dev/),
      expect.objectContaining({ url }),
      expect.objectContaining({ headers: expect.objectContaining({'Authorization': `Bearer ${apiKey}`}) }),
    )
    expect(scrapedData.success).toBe(true);
    expect(scrapedData?.data?.metadata.title).toEqual('Mendable');
  });
})