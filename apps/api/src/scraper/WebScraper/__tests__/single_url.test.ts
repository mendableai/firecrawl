jest.mock('../single_url', () => {
  const originalModule = jest.requireActual('../single_url');
  originalModule.fetchHtmlContent = jest.fn().mockResolvedValue('<html><head><title>Test</title></head><body><h1>Roast</h1></body></html>');

  return originalModule;
});

import { scrapSingleUrl } from '../single_url';
import { PageOptions } from '../../../lib/entities';

describe('scrapSingleUrl', () => {
  it('should handle includeHtml option correctly', async () => {
    const url = 'https://roastmywebsite.ai';
    const pageOptionsWithHtml: PageOptions = { includeHtml: true };
    const pageOptionsWithoutHtml: PageOptions = { includeHtml: false };

    const resultWithHtml = await scrapSingleUrl(url, pageOptionsWithHtml);
    const resultWithoutHtml = await scrapSingleUrl(url, pageOptionsWithoutHtml);

    expect(resultWithHtml.html).toBeDefined();
    expect(resultWithoutHtml.html).toBeUndefined();
  }, 10000);
});

import { scrapSingleUrl } from '../single_url';
import { PageOptions } from '../../../lib/entities';

// Mock the fetchHtmlContent function
jest.mock('../single_url', () => {
  const originalModule = jest.requireActual('../single_url');
  originalModule.fetchHtmlContent = jest.fn().mockResolvedValue(`
    <html>
      <head><title>Test Page</title></head>
      <body>
        <a href="https://example.com">Absolute Link</a>
        <a href="/relative">Relative Link</a>
        <a href="page">Page Link</a>
        <a href="#fragment">Fragment Link</a>
        <a href="mailto:test@example.com">Email Link</a>
      </body>
    </html>
  `);
  return originalModule;
});

describe('scrapSingleUrl with linksOnPage', () => {
  const baseUrl = 'https://test.com';

  it('should not include linksOnPage when option is false', async () => {
    const pageOptions: PageOptions = {};
    const result = await scrapSingleUrl(baseUrl, pageOptions);
    expect(result.linksOnPage).toBeUndefined();
  });

  it('should include linksOnPage when option is true', async () => {
    const pageOptions: PageOptions = {  };
    const result = await scrapSingleUrl(baseUrl, pageOptions);
    expect(result.linksOnPage).toBeDefined();
    expect(Array.isArray(result.linksOnPage)).toBe(true);
  });

  it('should correctly handle absolute URLs', async () => {
    const pageOptions: PageOptions = {  };
    const result = await scrapSingleUrl(baseUrl, pageOptions);
    expect(result.linksOnPage).toContain('https://example.com');
  });

  it('should correctly handle relative URLs', async () => {
    const pageOptions: PageOptions = {  };
    const result = await scrapSingleUrl(baseUrl, pageOptions);
    expect(result.linksOnPage).toContain('https://test.com/relative');
  });

  it('should correctly handle page URLs', async () => {
    const pageOptions: PageOptions = {  };
    const result = await scrapSingleUrl(baseUrl, pageOptions);
    expect(result.linksOnPage).toContain('https://test.com/page');
  });

  it('should not include fragment-only links', async () => {
    const pageOptions: PageOptions = {  };
    const result = await scrapSingleUrl(baseUrl, pageOptions);
    expect(result.linksOnPage).not.toContain('#fragment');
    expect(result.linksOnPage).not.toContain('https://test.com/#fragment');
  });

  it('should include mailto links', async () => {
    const pageOptions: PageOptions = {  };
    const result = await scrapSingleUrl(baseUrl, pageOptions);
    expect(result.linksOnPage).toContain('mailto:test@example.com');
  });

  it('should return unique links', async () => {
    const pageOptions: PageOptions = {  };
    const result = await scrapSingleUrl(baseUrl, pageOptions);
    const uniqueLinks = new Set(result.linksOnPage);
    expect(result.linksOnPage?.length).toBe(uniqueLinks.size);
  });
});

it('should return a list of links on the mendable.ai page', async () => {
  const url = 'https://mendable.ai';
  const pageOptions: PageOptions = { includeHtml: true };

  const result = await scrapSingleUrl(url, pageOptions);

  // Check if the result contains a list of links
  expect(result.linksOnPage).toBeDefined();
  expect(Array.isArray(result.linksOnPage)).toBe(true);
  expect(result.linksOnPage.length).toBeGreaterThan(0);
}, 10000);




