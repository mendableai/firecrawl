# 🌐 Websites with Data Attributes - Testing Guide

## 🎯 **Prime Testing Candidates**

Here are websites known to use extensive data attributes, perfect for testing our extraction feature:

### 1. **GitHub** (Excellent for Testing)
- **URL**: `https://github.com/microsoft/vscode`
- **Common Data Attributes**:
  ```json
  [
    {"selector": "[data-testid]", "attribute": "data-testid"},
    {"selector": "[data-view-component]", "attribute": "data-view-component"}, 
    {"selector": ".js-navigation-item", "attribute": "data-name"},
    {"selector": "[data-turbo-frame]", "attribute": "data-turbo-frame"},
    {"selector": ".octicon", "attribute": "data-octicon"}
  ]
  ```
- **Why Good**: Tons of data attributes, fast loading, scraping-friendly

### 2. **Hacker News** (Simple & Reliable)
- **URL**: `https://news.ycombinator.com`
- **Common Data Attributes**:
  ```json
  [
    {"selector": ".athing", "attribute": "id"},
    {"selector": ".titleline a", "attribute": "href"},
    {"selector": ".score", "attribute": "id"}
  ]
  ```
- **Why Good**: Simple HTML, consistent structure, no anti-bot measures

### 3. **Stack Overflow** (Rich Data Attributes)
- **URL**: `https://stackoverflow.com/questions/tagged/javascript`
- **Common Data Attributes**:
  ```json
  [
    {"selector": "[data-questionid]", "attribute": "data-questionid"},
    {"selector": "[data-post-id]", "attribute": "data-post-id"},
    {"selector": ".js-vote-count", "attribute": "data-value"},
    {"selector": "[data-answerid]", "attribute": "data-answerid"}
  ]
  ```
- **Why Good**: Rich metadata, well-structured, educational content

### 4. **Reddit (Old Version)** (Clean Data Attributes)
- **URL**: `https://old.reddit.com/r/programming`
- **Common Data Attributes**:
  ```json
  [
    {"selector": ".thing", "attribute": "data-fullname"},
    {"selector": ".thing", "attribute": "data-subreddit"},
    {"selector": ".thing", "attribute": "data-url"},
    {"selector": ".entry", "attribute": "data-type"}
  ]
  ```
- **Why Good**: Simple HTML, consistent data attributes

### 5. **Product Hunt** (Product Data)
- **URL**: `https://www.producthunt.com`
- **Common Data Attributes**:
  ```json
  [
    {"selector": "[data-test]", "attribute": "data-test"},
    {"selector": ".product-item", "attribute": "data-product-id"},
    {"selector": "[data-cy]", "attribute": "data-cy"}
  ]
  ```
- **Why Good**: Product-focused, good for e-commerce testing

### 6. **Dev.to** (Developer Content)
- **URL**: `https://dev.to`
- **Common Data Attributes**:
  ```json
  [
    {"selector": "[data-article-id]", "attribute": "data-article-id"},
    {"selector": "[data-user-id]", "attribute": "data-user-id"},
    {"selector": ".reaction-button", "attribute": "data-category"}
  ]
  ```
- **Why Good**: Developer-friendly, clean HTML structure

---

## 🔍 **How to Discover Data Attributes**

### Browser Inspection Method:
1. Open any website
2. Right-click → "Inspect Element"
3. Search for `data-` in the Elements panel
4. Note the selectors and attribute names

### Console Discovery Script:
```javascript
// Run this in browser console to find data attributes
Array.from(document.querySelectorAll('*'))
  .filter(el => Array.from(el.attributes).some(attr => attr.name.startsWith('data-')))
  .slice(0, 10)
  .map(el => ({
    tag: el.tagName,
    classes: el.className,
    dataAttrs: Array.from(el.attributes)
      .filter(attr => attr.name.startsWith('data-'))
      .map(attr => `${attr.name}="${attr.value}"`)
  }));
```

---

## 🧪 **Ready-to-Use Test Requests**

### Test 1: GitHub Repository
```json
{
  "url": "https://github.com/microsoft/vscode",
  "extractDataAttributes": [
    {"selector": "[data-testid]", "attribute": "data-testid"},
    {"selector": "[data-view-component='true']", "attribute": "data-view-component"},
    {"selector": ".js-navigation-item", "attribute": "data-name"}
  ],
  "formats": ["markdown"]
}
```

### Test 2: Hacker News Stories
```json
{
  "url": "https://news.ycombinator.com",
  "extractDataAttributes": [
    {"selector": ".athing", "attribute": "id"},
    {"selector": ".titleline", "attribute": "data-id"},
    {"selector": ".score", "attribute": "id"}
  ],
  "formats": ["markdown"]
}
```

### Test 3: Stack Overflow Questions
```json
{
  "url": "https://stackoverflow.com/questions/tagged/javascript",
  "extractDataAttributes": [
    {"selector": "[data-questionid]", "attribute": "data-questionid"},
    {"selector": ".js-vote-count", "attribute": "data-value"},
    {"selector": "[data-post-id]", "attribute": "data-post-id"}
  ],
  "formats": ["markdown"]
}
```

### Test 4: Reddit Posts (Old Interface)
```json
{
  "url": "https://old.reddit.com/r/programming",
  "extractDataAttributes": [
    {"selector": ".thing", "attribute": "data-fullname"},
    {"selector": ".thing", "attribute": "data-subreddit"},
    {"selector": ".thing", "attribute": "data-url"}
  ],
  "formats": ["markdown"]
}
```

---

## 🎯 **Testing Strategy**

### 1. **Start Simple**
Begin with Hacker News - it has simple, consistent data attributes.

### 2. **Progress to Complex**
Move to GitHub or Stack Overflow for more complex attribute structures.

### 3. **Test Edge Cases**
- Elements with no matching attributes
- Multiple values per selector
- Complex CSS selector combinations

### 4. **Validate Results**
Compare extracted data with what you see in browser dev tools.

---

## 🚀 **Example Results You Should Expect**

### Hacker News Test Result:
```json
{
  "dataAttributes": [
    {
      "selector": ".athing",
      "attribute": "id",
      "values": ["39219123", "39218456", "39217890"]
    }
  ]
}
```

### GitHub Test Result:
```json
{
  "dataAttributes": [
    {
      "selector": "[data-testid]",
      "attribute": "data-testid", 
      "values": ["repository-content", "file-tree", "breadcrumb"]
    }
  ]
}
```

---

## ⚠️ **Important Notes**

1. **Scraping Ethics**: Always check `robots.txt` and terms of service
2. **Rate Limiting**: Don't overwhelm servers with requests
3. **Dynamic Content**: Some attributes may be added via JavaScript
4. **Data Freshness**: Attribute values change frequently on dynamic sites

---

## 🔧 **Quick Test Commands**

Once your Docker is working, try these:

```bash
# Test 1: Hacker News (Simple)
curl -X POST http://localhost:3002/v2/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://news.ycombinator.com", "extractDataAttributes": [{"selector": ".athing", "attribute": "id"}]}'

# Test 2: GitHub (Complex)  
curl -X POST http://localhost:3002/v2/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com/microsoft/vscode", "extractDataAttributes": [{"selector": "[data-testid]", "attribute": "data-testid"}]}'
```

These websites are perfect for testing your data attribute extraction feature! 🎉
