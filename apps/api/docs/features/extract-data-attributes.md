# Extract Data Attributes Feature

## Overview

The Extract Data Attributes feature allows you to extract specific `data-*` attributes from HTML elements using CSS selectors. This is useful when websites store meaningful content in data attributes rather than in visible text.

## API Usage

### Request

Add the `extractDataAttributes` field to your scrape options:

```json
{
  "url": "https://example.com",
  "extractDataAttributes": [
    {
      "selector": ".vehicle-card",
      "attribute": "data-vehicle-name"
    },
    {
      "selector": ".product-item",
      "attribute": "data-product-id"
    }
  ]
}
```

### Response

The extracted data attributes will be returned in the `dataAttributes` field:

```json
{
  "success": true,
  "data": {
    "url": "https://example.com",
    "markdown": "...",
    "dataAttributes": [
      {
        "selector": ".vehicle-card",
        "attribute": "data-vehicle-name",
        "values": ["Tesla Model 3", "BMW X5", "Honda Civic"]
      },
      {
        "selector": ".product-item",
        "attribute": "data-product-id",
        "values": ["prod-123", "prod-456"]
      }
    ]
  }
}
```

## Features

- **CSS Selectors**: Use any valid CSS selector to target elements
- **Flexible Attribute Names**: Specify attributes with or without the `data-` prefix
- **Multiple Values**: Automatically collects values from all matching elements
- **Empty Results**: Returns empty arrays when no elements match

## Examples

### Basic Usage

Extract vehicle information from data attributes:

```javascript
const options = {
  url: "https://car-dealership.com",
  extractDataAttributes: [
    { selector: ".car", attribute: "data-vehicle-name" },
    { selector: ".car", attribute: "data-price" },
    { selector: ".car", attribute: "data-year" }
  ]
};
```

### Complex Selectors

Use advanced CSS selectors:

```javascript
const options = {
  extractDataAttributes: [
    // Target specific nested elements
    { selector: "#inventory .vehicle[data-available='true']", attribute: "data-id" },
    
    // Target elements with specific attributes
    { selector: "[data-product-category='electronics']", attribute: "data-sku" },
    
    // Use pseudo-selectors
    { selector: ".item:not(.sold-out)", attribute: "data-stock" }
  ]
};
```

### Without data- Prefix

The feature supports both formats:

```javascript
// Both of these work the same way:
{ selector: ".item", attribute: "data-product-id" }
{ selector: ".item", attribute: "product-id" }
```

## Use Cases

1. **E-commerce**: Extract product IDs, SKUs, prices, and inventory data
2. **Real Estate**: Extract property IDs, prices, and features
3. **Automotive**: Extract vehicle specifications and pricing
4. **Job Boards**: Extract job IDs and metadata
5. **Any site that stores structured data in HTML attributes**

## Technical Details

- The extraction happens after HTML processing but before markdown conversion
- Works with all scraping engines (Playwright, etc.)
- Minimal performance impact
- Preserves the order of elements as they appear in the DOM
