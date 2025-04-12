import axios from 'axios';
import FirecrawlApp from '../../../../src/index';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Change Tracking Tests', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should support basic change tracking format', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      status: 200,
      data: {
        success: true,
        data: {
          markdown: 'Test markdown content',
          changeTracking: {
            previousScrapeAt: '2023-01-01T00:00:00Z',
            changeStatus: 'changed',
            visibility: 'visible'
          }
        }
      }
    });

    const app = new FirecrawlApp({ apiKey: process.env.TEST_API_KEY || 'dummy-api-key-for-testing' });
    const result = await app.scrapeUrl('https://example.com', {
      formats: ['markdown', 'changeTracking']
    });

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post.mock.calls[0][1].formats).toContain('changeTracking');
    
    expect(result).toHaveProperty('changeTracking');
    expect(result.changeTracking?.previousScrapeAt).toBe('2023-01-01T00:00:00Z');
    expect(result.changeTracking?.changeStatus).toBe('changed');
    expect(result.changeTracking?.visibility).toBe('visible');
  });

  it('should support change tracking options with git-diff and json modes', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      status: 200,
      data: {
        success: true,
        data: {
          markdown: 'Test markdown content',
          changeTracking: {
            previousScrapeAt: '2023-01-01T00:00:00Z',
            changeStatus: 'changed',
            visibility: 'visible',
            diff: {
              text: '@@ -1,1 +1,1 @@\n-old content\n+new content',
              json: {
                files: [{
                  from: null,
                  to: null,
                  chunks: [{
                    content: '@@ -1,1 +1,1 @@',
                    changes: [{
                      type: 'del',
                      content: '-old content',
                      del: true,
                      ln: 1
                    }, {
                      type: 'add',
                      content: '+new content',
                      add: true,
                      ln: 1
                    }]
                  }]
                }]
              }
            },
            json: {
              title: {
                previous: 'Old Title',
                current: 'New Title'
              }
            }
          }
        }
      }
    });

    const app = new FirecrawlApp({ apiKey: process.env.TEST_API_KEY || 'dummy-api-key-for-testing' });
    const result = await app.scrapeUrl('https://example.com', {
      formats: ['markdown', 'changeTracking'],
      changeTrackingOptions: {
        modes: ['git-diff', 'json'],
        schema: { type: 'object', properties: { title: { type: 'string' } } }
      }
    });

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post.mock.calls[0][1].formats).toContain('changeTracking');
    expect(mockedAxios.post.mock.calls[0][1].changeTrackingOptions.modes).toEqual(['git-diff', 'json']);
    
    expect(result).toHaveProperty('changeTracking');
    expect(result.changeTracking?.diff?.text).toBe('@@ -1,1 +1,1 @@\n-old content\n+new content');
    expect(result.changeTracking?.json?.title.previous).toBe('Old Title');
    expect(result.changeTracking?.json?.title.current).toBe('New Title');
  });
});
