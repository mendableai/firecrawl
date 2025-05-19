import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { searchController } from '../../controllers/v1/search';
import * as blocklist from '../../scraper/WebScraper/utils/blocklist';
import { SearchResponse } from '../../controllers/v1/types';

jest.mock('../../services/billing/credit_billing', () => ({
  billTeam: jest.fn().mockImplementation(() => Promise.resolve({ success: true })),
}));

jest.mock('../../search', () => ({
  search: jest.fn().mockImplementation(() => Promise.resolve([
    { url: 'https://example.com', title: 'Example Site', description: 'An example website' },
    { url: 'https://blocked-site.com', title: 'Blocked Site', description: 'A blocked website' }
  ]))
}));

jest.mock('../../services/redis', () => ({
  getValue: jest.fn().mockImplementation(() => Promise.resolve(null)),
  setValue: jest.fn().mockImplementation(() => Promise.resolve(null)),
  redisConnection: {
    sadd: jest.fn().mockImplementation(() => Promise.resolve(null))
  }
}));

jest.mock('../../services/queue-jobs', () => ({
  addScrapeJob: jest.fn().mockImplementation(() => Promise.resolve({})),
  waitForJob: jest.fn().mockImplementation(() => Promise.resolve({})),
}));

jest.mock('../../services/queue-service', () => ({
  getScrapeQueue: jest.fn().mockReturnValue({ 
    remove: jest.fn().mockReturnValue(Promise.resolve()) 
  }),
}));


jest.mock('../../services/logging/log_job', () => ({
  logJob: jest.fn(),
}));

jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
}));

jest.mock('../../lib/extract/extraction-service', () => ({
  CostTracking: jest.fn().mockImplementation(() => ({
    addCost: jest.fn(),
    getCost: jest.fn().mockReturnValue({})
  }))
}));

describe('Search Controller URL Filtering', () => {
  const mockResponse: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };

  const mockRequest: any = {
    auth: {
      team_id: 'test-team',
    },
    acuc: {
      flags: null,
      sub_id: 'test-sub-id',
    },
    body: {
      query: 'test query',
      limit: 10,
      lang: 'en',
      country: 'us',
      origin: 'test',
      timeout: 60000,
      scrapeOptions: {
        formats: [],
      },
      ignoreInvalidURLs: true,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(blocklist, 'isUrlBlocked').mockImplementation((url) => {
      return url === 'https://blocked-site.com';
    });
  });

  it('should filter out invalid URLs when ignoreInvalidURLs is true', async () => {
    await searchController(mockRequest, mockResponse);

    expect(blocklist.isUrlBlocked).toHaveBeenCalledWith('https://blocked-site.com', null);
    expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.arrayContaining([
        expect.objectContaining({ url: 'https://example.com' }),
      ]),
      warning: expect.stringContaining('unsupported/invalid URLs were filtered'),
      invalidURLs: expect.arrayContaining(['https://blocked-site.com']),
    }));

    expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.arrayContaining([
        expect.objectContaining({ url: 'https://blocked-site.com' }),
      ]),
    }));
  });

  it('should not filter out invalid URLs when ignoreInvalidURLs is false', async () => {
    const request = {
      ...mockRequest,
      body: {
        ...mockRequest.body,
        ignoreInvalidURLs: false,
      },
    };

    await searchController(request, mockResponse);

    expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.arrayContaining([
        expect.objectContaining({ url: 'https://example.com' }),
        expect.objectContaining({ url: 'https://blocked-site.com' }),
      ]),
    }));

    expect(mockResponse.json).not.toHaveBeenCalledWith(expect.objectContaining({
      warning: expect.stringContaining('unsupported/invalid URLs were filtered'),
      invalidURLs: expect.anything(),
    }));
  });

  it('should handle empty results after filtering', async () => {
    jest.spyOn(blocklist, 'isUrlBlocked').mockImplementation(() => true);
    
    await searchController(mockRequest, mockResponse);

    expect(blocklist.isUrlBlocked).toHaveBeenCalled();
    expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.arrayContaining([]),
      warning: expect.stringContaining('unsupported/invalid URLs were filtered'),
      invalidURLs: expect.arrayContaining(['https://example.com', 'https://blocked-site.com']),
    }));
  });
});
