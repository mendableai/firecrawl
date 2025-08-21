import { describe, it, expect } from '@jest/globals';
import { extractDataAttributes } from '../../scraper/scrapeURL/lib/extractDataAttributes';

describe('extractDataAttributes', () => {
  it('should extract data attributes from HTML', async () => {
    const html = `
      <html>
        <body>
          <div class="vehicle" data-vehicle-name="Tesla Model 3" data-vehicle-year="2023">
            Tesla Model 3
          </div>
          <div class="vehicle" data-vehicle-name="BMW X5" data-vehicle-year="2022">
            BMW X5
          </div>
          <div class="product" data-product-id="12345" data-price="99.99">
            Product 1
          </div>
        </body>
      </html>
    `;

    const scrapeOptions: any = {
      extractDataAttributes: [
        { selector: '.vehicle', attribute: 'data-vehicle-name' },
        { selector: '.vehicle', attribute: 'data-vehicle-year' },
        { selector: '.product', attribute: 'data-product-id' },
      ],
      formats: [{ type: 'markdown' }],
      onlyMainContent: true,
      waitFor: 0,
      mobile: false,
    };

    const results = await extractDataAttributes(html, scrapeOptions);

    expect(results).toHaveLength(3);
    
    // Check vehicle names
    expect(results[0]).toEqual({
      selector: '.vehicle',
      attribute: 'data-vehicle-name',
      values: ['Tesla Model 3', 'BMW X5']
    });

    // Check vehicle years
    expect(results[1]).toEqual({
      selector: '.vehicle',
      attribute: 'data-vehicle-year',
      values: ['2023', '2022']
    });

    // Check product IDs
    expect(results[2]).toEqual({
      selector: '.product',
      attribute: 'data-product-id',
      values: ['12345']
    });
  });

  it('should handle attribute names without data- prefix', async () => {
    const html = `
      <div class="item" data-item-name="Item 1"></div>
      <div class="item" data-item-name="Item 2"></div>
    `;

    const scrapeOptions: any = {
      extractDataAttributes: [
        { selector: '.item', attribute: 'item-name' }, // Without data- prefix
      ],
      formats: [{ type: 'markdown' }],
      onlyMainContent: true,
      waitFor: 0,
      mobile: false,
    };

    const results = await extractDataAttributes(html, scrapeOptions);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      selector: '.item',
      attribute: 'item-name',
      values: ['Item 1', 'Item 2']
    });
  });

  it('should return empty array when no matching elements found', async () => {
    const html = `<div>No data attributes here</div>`;

    const scrapeOptions: any = {
      extractDataAttributes: [
        { selector: '.nonexistent', attribute: 'data-test' },
      ],
      formats: [{ type: 'markdown' }],
      onlyMainContent: true,
      waitFor: 0,
      mobile: false,
    };

    const results = await extractDataAttributes(html, scrapeOptions);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      selector: '.nonexistent',
      attribute: 'data-test',
      values: []
    });
  });

  it('should return empty array when no extractDataAttributes configured', async () => {
    const html = `<div data-test="value">Test</div>`;

    const scrapeOptions: any = {
      formats: [{ type: 'markdown' }],
      onlyMainContent: true,
      waitFor: 0,
      mobile: false,
    };

    const results = await extractDataAttributes(html, scrapeOptions);

    expect(results).toEqual([]);
  });

  it('should handle complex CSS selectors', async () => {
    const html = `
      <div id="container">
        <span class="nested-item" data-value="1">Item 1</span>
        <span class="nested-item active" data-value="2">Item 2</span>
        <div>
          <span class="nested-item" data-value="3">Item 3</span>
        </div>
      </div>
    `;

    const scrapeOptions: any = {
      extractDataAttributes: [
        { selector: '#container .nested-item', attribute: 'data-value' },
        { selector: '.nested-item.active', attribute: 'data-value' },
      ],
      formats: [{ type: 'markdown' }],
      onlyMainContent: true,
      waitFor: 0,
      mobile: false,
    };

    const results = await extractDataAttributes(html, scrapeOptions);

    expect(results).toHaveLength(2);
    
    // All nested items
    expect(results[0]).toEqual({
      selector: '#container .nested-item',
      attribute: 'data-value',
      values: ['1', '2', '3']
    });

    // Only active items
    expect(results[1]).toEqual({
      selector: '.nested-item.active',
      attribute: 'data-value',
      values: ['2']
    });
  });
});
