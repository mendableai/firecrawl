import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { searchController } from '../../controllers/v1/search';
import * as blocklist from '../../scraper/WebScraper/utils/blocklist';
import { SearchResponse } from '../../controllers/v1/types';

jest.mock('../../services/billing/credit_billing');
jest.mock('../../search');


jest.mock('../../services/logging/log_job', () => ({
  logJob: jest.fn(),
}));

jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
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
      filterBlockedUrls: true,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(blocklist, 'isUrlBlocked').mockImplementation((url) => {
      return url === 'https://blocked-site.com';
    });
  });

  it('should filter out blocked URLs when filterBlockedUrls is true', async () => {
    await searchController(mockRequest, mockResponse);

    expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.arrayContaining([
        expect.objectContaining({ url: 'https://example.com' }),
      ]),
      warning: expect.stringContaining('blocked URLs were filtered'),
    }));

    expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.arrayContaining([
        expect.objectContaining({ url: 'https://blocked-site.com' }),
      ]),
    }));
  });

  it('should not filter out blocked URLs when filterBlockedUrls is false', async () => {
    const request = {
      ...mockRequest,
      body: {
        ...mockRequest.body,
        filterBlockedUrls: false,
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
      warning: expect.stringContaining('blocked URLs were filtered'),
    }));
  });

  it('should handle empty results after filtering', async () => {
    jest.spyOn(blocklist, 'isUrlBlocked').mockImplementation(() => true);
    
    await searchController(mockRequest, mockResponse);

    expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.arrayContaining([]),
      warning: expect.stringContaining('No search results found'),
    }));
  });
});
