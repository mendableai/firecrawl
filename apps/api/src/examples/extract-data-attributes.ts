/**
 * Example: Extract data-* attributes from HTML elements
 * 
 * This example demonstrates how to use the new extractDataAttributes feature
 * to extract specific data attributes from HTML elements using CSS selectors.
 */

import { ScrapeOptions } from '../controllers/v2/types';

// Example HTML that contains data attributes
const exampleHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Vehicle Listings</title>
</head>
<body>
    <div class="vehicle-card" data-vehicle-name="Tesla Model 3" data-vehicle-year="2023" data-price="45000">
        <h3>Tesla Model 3</h3>
        <p>2023 Model - $45,000</p>
    </div>
    
    <div class="vehicle-card" data-vehicle-name="BMW X5" data-vehicle-year="2022" data-price="65000">
        <h3>BMW X5</h3>
        <p>2022 Model - $65,000</p>
    </div>
    
    <div class="dealer-info" data-dealer-id="dealer-123" data-location="San Francisco">
        <p>Visit our dealership in San Francisco</p>
    </div>
</body>
</html>
`;

// Example scrape options with data attribute extraction
const scrapeOptionsExample: Partial<ScrapeOptions> = {
  // Extract specific data attributes from elements
  extractDataAttributes: [
    {
      selector: '.vehicle-card',
      attribute: 'data-vehicle-name'
    },
    {
      selector: '.vehicle-card',
      attribute: 'data-vehicle-year'
    },
    {
      selector: '.vehicle-card',
      attribute: 'data-price'
    },
    {
      selector: '[data-dealer-id]',
      attribute: 'data-dealer-id'
    },
    {
      selector: '[data-dealer-id]',
      attribute: 'data-location'
    }
  ],
  
  // Other options
  formats: [{ type: 'markdown' }, { type: 'html' }],
  onlyMainContent: true,
};

// Example API request
const apiRequestExample = {
  method: 'POST',
  url: '/v2/scrape',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: {
    url: 'https://example.com/vehicles',
    ...scrapeOptionsExample
  }
};

// Example response with extracted data attributes
const expectedResponse = {
  success: true,
  data: {
    url: 'https://example.com/vehicles',
    markdown: '# Vehicle Listings\n\n...',
    html: '<html>...</html>',
    dataAttributes: [
      {
        selector: '.vehicle-card',
        attribute: 'data-vehicle-name',
        values: ['Tesla Model 3', 'BMW X5']
      },
      {
        selector: '.vehicle-card',
        attribute: 'data-vehicle-year',
        values: ['2023', '2022']
      },
      {
        selector: '.vehicle-card',
        attribute: 'data-price',
        values: ['45000', '65000']
      },
      {
        selector: '[data-dealer-id]',
        attribute: 'data-dealer-id',
        values: ['dealer-123']
      },
      {
        selector: '[data-dealer-id]',
        attribute: 'data-location',
        values: ['San Francisco']
      }
    ],
    metadata: {
      statusCode: 200,
      // ... other metadata
    }
  }
};

console.log('API Request Example:', JSON.stringify(apiRequestExample, null, 2));
console.log('\nExpected Response Structure:', JSON.stringify(expectedResponse, null, 2));

// Usage tips
console.log('\n--- Usage Tips ---');
console.log('1. You can use any valid CSS selector to target elements');
console.log('2. The attribute name can include the "data-" prefix or omit it');
console.log('3. Multiple values are returned as an array when multiple elements match');
console.log('4. Empty arrays are returned when no elements match the selector');
console.log('5. This feature works with all scraping engines (playwright, etc.)');

export { scrapeOptionsExample, apiRequestExample, expectedResponse };
