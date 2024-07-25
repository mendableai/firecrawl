// crawler.test.ts
import { WebCrawler } from '../crawler';
import axios from 'axios';
import robotsParser from 'robots-parser';
import { getAdjustedMaxDepth } from '../utils/maxDepthUtils';

jest.mock('axios');
jest.mock('robots-parser');

describe('WebCrawler', () => {
  let crawler: WebCrawler;
  const mockAxios = axios as jest.Mocked<typeof axios>;
  const mockRobotsParser = robotsParser as jest.MockedFunction<typeof robotsParser>;

  let maxCrawledDepth: number;

  beforeEach(() => {
    // Setup default mocks
    mockAxios.get.mockImplementation((url) => {
      if (url.includes('robots.txt')) {
        return Promise.resolve({ data: 'User-agent: *\nAllow: /' });
      } else if (url.includes('sitemap.xml')) {
        return Promise.resolve({ data: 'sitemap content' }); // You would normally parse this to URLs
      }
      return Promise.resolve({ data: '<html></html>' });
    });

    mockRobotsParser.mockReturnValue({
      isAllowed: jest.fn().mockReturnValue(true),
      isDisallowed: jest.fn().mockReturnValue(false),
      getMatchingLineNumber: jest.fn().mockReturnValue(0),
      getCrawlDelay: jest.fn().mockReturnValue(0),
      getSitemaps: jest.fn().mockReturnValue([]),
      getPreferredHost: jest.fn().mockReturnValue('example.com')
    });
  });

  it('should filter out links that exceed maxDepth param of 2 based on enterURL depth of 0 ', async () => {
    const initialUrl = 'http://example.com'; // Set initial URL for this test
    const enteredMaxCrawledDepth = 2;
    maxCrawledDepth = getAdjustedMaxDepth(initialUrl, enteredMaxCrawledDepth);


    crawler = new WebCrawler({
      jobId: "TEST",
      initialUrl: initialUrl,
      includes: [],
      excludes: [],
      limit: 100,
      maxCrawledDepth: maxCrawledDepth, // Set maxDepth for testing
    });

    // Mock sitemap fetching function to return controlled links
    crawler['tryFetchSitemapLinks'] = jest.fn().mockResolvedValue([
      initialUrl, // depth 0
      initialUrl + '/page1', // depth 1
      initialUrl + '/page1/page2', // depth 2
      initialUrl + '/page1/page2/page3' // depth 3, should be filtered out
    ]);

    const results = await crawler.start(undefined, undefined, undefined, undefined, undefined, maxCrawledDepth);
    expect(results).toEqual([
      { url: initialUrl, html: '' },
      { url: initialUrl + '/page1', html: '' },
      { url: initialUrl + '/page1/page2', html: '' }
    ]);


    // Ensure that the link with depth 3 is not included
    expect(results.some(r => r.url === initialUrl + '/page1/page2/page3')).toBe(false);
  });

  it('should filter out links that exceed maxDepth param of 0 based on enterURL depth of 0 ', async () => {
    const initialUrl = 'http://example.com'; // Set initial URL for this test
    const enteredMaxCrawledDepth = 0;
    maxCrawledDepth = getAdjustedMaxDepth(initialUrl, enteredMaxCrawledDepth);
   

    crawler = new WebCrawler({
      jobId: "TEST",
      initialUrl: initialUrl,
      includes: [],
      excludes: [],
      limit: 100,
      maxCrawledDepth: maxCrawledDepth, // Set maxDepth for testing
    });

    // Mock sitemap fetching function to return controlled links
    crawler['tryFetchSitemapLinks'] = jest.fn().mockResolvedValue([
      initialUrl, // depth 0
      initialUrl + '/page1', // depth 1
      initialUrl + '/page1/page2', // depth 2
      initialUrl + '/page1/page2/page3' // depth 3, should be filtered out
    ]);

    const results = await crawler.start(undefined, undefined, undefined, undefined, undefined, maxCrawledDepth);
    expect(results).toEqual([
      { url: initialUrl, html: '' },
    ]);  
  });

  it('should filter out links that exceed maxDepth param of 1 based on enterURL depth of 1 ', async () => {
    const initialUrl = 'http://example.com/page1'; // Set initial URL for this test
    const enteredMaxCrawledDepth = 1;
    maxCrawledDepth = getAdjustedMaxDepth(initialUrl, enteredMaxCrawledDepth);
  

    crawler = new WebCrawler({
      jobId: "TEST",
      initialUrl: initialUrl,
      includes: [],
      excludes: [],
      limit: 100,
      maxCrawledDepth: maxCrawledDepth, // Set maxDepth for testing
    });

    // Mock sitemap fetching function to return controlled links
    crawler['tryFetchSitemapLinks'] = jest.fn().mockResolvedValue([
      initialUrl, // depth 0
      initialUrl + '/page2', // depth 1
      initialUrl + '/page2/page3', // depth 2
      initialUrl + '/page2/page3/page4' // depth 3, should be filtered out
    ]);

    const results = await crawler.start(undefined, undefined, undefined, undefined, undefined, maxCrawledDepth);
    expect(results).toEqual([
      { url: initialUrl, html: '' },
      { url: initialUrl + '/page2', html: '' }
    ]);
  });

  it('should filter out links that exceed maxDepth param of 1 based on enterURL depth of 2 ', async () => {
    const initialUrl = 'http://example.com/page1'; // Set initial URL for this test
    const enteredMaxCrawledDepth = 2;
    maxCrawledDepth = getAdjustedMaxDepth(initialUrl, enteredMaxCrawledDepth);
 

    crawler = new WebCrawler({
      jobId: "TEST",
      initialUrl: initialUrl,
      includes: [],
      excludes: [],
      limit: 100,
      maxCrawledDepth: maxCrawledDepth, // Set maxDepth for testing
    });

    // Mock sitemap fetching function to return controlled links
    crawler['tryFetchSitemapLinks'] = jest.fn().mockResolvedValue([
      initialUrl, // depth 0
      initialUrl + '/page2', // depth 1
      initialUrl + '/page2/page3', // depth 2
      initialUrl + '/page2/page3/page4' // depth 3, should be filtered out
    ]);

    const results = await crawler.start(undefined, undefined, undefined, undefined, undefined, maxCrawledDepth);
    expect(results).toEqual([
      { url: initialUrl, html: '' },
      { url: initialUrl + '/page2', html: '' },
      { url: initialUrl + '/page2/page3', html: '' }
    ]);   
  });

  it('should handle allowBackwardCrawling option correctly', async () => {
    const initialUrl = 'https://mendable.ai/blog';
  
    // Setup the crawler with the specific test case options
    const crawler = new WebCrawler({
      jobId: "TEST",
      initialUrl: initialUrl,
      includes: [],
      excludes: [],
      limit: 100,
      maxCrawledDepth: 3, // Example depth
      allowBackwardCrawling: true
    });
  
    // Mock the sitemap fetching function to simulate backward crawling
    crawler['tryFetchSitemapLinks'] = jest.fn().mockResolvedValue([
      initialUrl,
      'https://mendable.ai', // backward link
      initialUrl + '/page1',
      initialUrl + '/page1/page2'
    ]);
  
    const results = await crawler.start();
    expect(results).toEqual([
      { url: initialUrl, html: '' },
      { url: 'https://mendable.ai', html: '' }, // Expect the backward link to be included
      { url: initialUrl + '/page1', html: '' },
      { url: initialUrl + '/page1/page2', html: '' }
    ]);
  
    // Check that the backward link is included if allowBackwardCrawling is true
    expect(results.some(r => r.url === 'https://mendable.ai')).toBe(true);
  });

  it('should respect the limit parameter by not returning more links than specified', async () => {
    const initialUrl = 'http://example.com';
    const limit = 2;  // Set a limit for the number of links

    crawler = new WebCrawler({
      jobId: "TEST",
      initialUrl: initialUrl,
      includes: [],
      excludes: [],
      limit: limit,  // Apply the limit
      maxCrawledDepth: 10
    });

    // Mock sitemap fetching function to return more links than the limit
    crawler['tryFetchSitemapLinks'] = jest.fn().mockResolvedValue([
      initialUrl,
      initialUrl + '/page1',
      initialUrl + '/page2',
      initialUrl + '/page3'
    ]);

    const filteredLinks = crawler['filterLinks'](
      [initialUrl, initialUrl + '/page1', initialUrl + '/page2', initialUrl + '/page3'],
      limit,
      10
    );

    expect(filteredLinks.length).toBe(limit);  // Check if the number of results respects the limit
    expect(filteredLinks).toEqual([
      initialUrl,
      initialUrl + '/page1'
    ]);
  });
});

