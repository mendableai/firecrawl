import { describe, it, expect } from '@jest/globals';
import { deriveDataAttributesFromHTML } from '../../scraper/scrapeURL/transformers/dataAttributes';
import { Document } from '../../controllers/v2/types';
import { Logger } from 'winston';
import { Meta } from '../../scraper/scrapeURL';

describe('Data Attributes E2E', () => {
  const mockLogger: Logger = {
    debug: jest.fn(),
    error: jest.fn(),
    child: jest.fn(() => mockLogger),
  } as any;

  const createMockMeta = (options: any): Meta => ({
    id: 'test-id',
    url: 'https://example.com',
    options,
    internalOptions: { teamId: 'test-team-id' },
    logger: mockLogger,
    abort: null as any,
    featureFlags: new Set(),
    mock: null,
    pdfPrefetch: null,
    costTracking: {} as any,
  });

  it('should extract data attributes through the transformer', async () => {
    const document: Document = {
      html: `
        <html>
          <body>
            <div class="car-listing" data-vehicle-name="Honda Civic" data-price="25000">
              Honda Civic - $25,000
            </div>
            <div class="car-listing" data-vehicle-name="Toyota Camry" data-price="28000">
              Toyota Camry - $28,000
            </div>
            <span data-dealer-id="dealer-123" data-location="New York">
              Dealer Info
            </span>
          </body>
        </html>
      `,
      metadata: {
        sourceURL: 'https://example.com',
        statusCode: 200,
        proxyUsed: 'basic',
      },
    };

    const meta = createMockMeta({
      extractDataAttributes: [
        { selector: '.car-listing', attribute: 'data-vehicle-name' },
        { selector: '.car-listing', attribute: 'data-price' },
        { selector: '[data-dealer-id]', attribute: 'data-dealer-id' },
        { selector: '[data-dealer-id]', attribute: 'data-location' },
      ],
      formats: [{ type: 'markdown' }],
      onlyMainContent: true,
      waitFor: 0,
      mobile: false,
    });

    const result = await deriveDataAttributesFromHTML(meta, document);

    expect(result.dataAttributes).toBeDefined();
    expect(result.dataAttributes).toHaveLength(4);

    // Check vehicle names
    const vehicleNames = result.dataAttributes?.find(
      d => d.selector === '.car-listing' && d.attribute === 'data-vehicle-name'
    );
    expect(vehicleNames).toEqual({
      selector: '.car-listing',
      attribute: 'data-vehicle-name',
      values: ['Honda Civic', 'Toyota Camry']
    });

    // Check prices
    const prices = result.dataAttributes?.find(
      d => d.selector === '.car-listing' && d.attribute === 'data-price'
    );
    expect(prices).toEqual({
      selector: '.car-listing',
      attribute: 'data-price',
      values: ['25000', '28000']
    });

    // Check dealer ID
    const dealerId = result.dataAttributes?.find(
      d => d.selector === '[data-dealer-id]' && d.attribute === 'data-dealer-id'
    );
    expect(dealerId).toEqual({
      selector: '[data-dealer-id]',
      attribute: 'data-dealer-id',
      values: ['dealer-123']
    });

    // Check location
    const location = result.dataAttributes?.find(
      d => d.selector === '[data-dealer-id]' && d.attribute === 'data-location'
    );
    expect(location).toEqual({
      selector: '[data-dealer-id]',
      attribute: 'data-location',
      values: ['New York']
    });
  });

  it('should not add dataAttributes field when not configured', async () => {
    const document: Document = {
      html: `<div data-test="value">Test</div>`,
      metadata: {
        sourceURL: 'https://example.com',
        statusCode: 200,
        proxyUsed: 'basic',
      },
    };

    const meta = createMockMeta({
      formats: [{ type: 'markdown' }],
      onlyMainContent: true,
      waitFor: 0,
      mobile: false,
    });

    const result = await deriveDataAttributesFromHTML(meta, document);

    expect(result.dataAttributes).toBeUndefined();
  });

  it('should handle errors gracefully', async () => {
    const document: Document = {
      html: undefined, // This will cause an error
      metadata: {
        sourceURL: 'https://example.com',
        statusCode: 200,
        proxyUsed: 'basic',
      },
    };

    const meta = createMockMeta({
      extractDataAttributes: [
        { selector: '.test', attribute: 'data-test' },
      ],
      formats: [{ type: 'markdown' }],
      onlyMainContent: true,
      waitFor: 0,
      mobile: false,
    });

    await expect(
      deriveDataAttributesFromHTML(meta, document)
    ).rejects.toThrow('html is undefined');
  });
});
