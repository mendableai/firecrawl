import { jest } from '@jest/globals';

describe('CrawlWatcher', () => {
  const mockApiUrl = 'https://api.firecrawl.dev';
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    jest.resetModules();
  });

  test('should create a CrawlWatcher instance successfully when isows is available', async () => {
    await jest.unstable_mockModule('isows', () => ({
      WebSocket: jest.fn(),
    }));

    const { default: FirecrawlApp, CrawlWatcher } = await import('../index');
    const app = new FirecrawlApp({ apiKey: mockApiKey, apiUrl: mockApiUrl });

    const watcher = new CrawlWatcher('test-id', app);
    expect(watcher).toBeInstanceOf(CrawlWatcher);
  });

  test('should throw when WebSocket is not available (isows import fails)', async () => {
    await jest.unstable_mockModule('isows', () => {
      throw new Error('Module not found');
    });

    const { default: FirecrawlApp, CrawlWatcher, FirecrawlError } = await import('../index');
    const app = new FirecrawlApp({ apiKey: mockApiKey, apiUrl: mockApiUrl });

    expect(() => {
      new CrawlWatcher('test-id', app);
    }).toThrow(FirecrawlError);
  });
});
