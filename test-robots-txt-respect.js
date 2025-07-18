const axios = require('axios');

// Test configuration
const API_KEY = 'YOUR_API_KEY_HERE'; // Replace with your API key
const API_URL = 'http://localhost:3002/api/v1/scrape'; // Adjust URL as needed

// Test URL that should be blocked by robots.txt
// Using a well-known example - many sites block certain paths in robots.txt
const TEST_URL_BLOCKED = 'https://example.com/admin'; // This path is commonly blocked
const TEST_URL_ALLOWED = 'https://example.com/'; // Root is usually allowed

async function testRobotsTxtRespect() {
  console.log('Testing robots.txt respect for scrapes...\n');

  try {
    // Test 1: Scrape a blocked URL (should fail when respectRobotsOnScrapes is enabled)
    console.log('Test 1: Scraping a URL that should be blocked by robots.txt...');
    console.log(`URL: ${TEST_URL_BLOCKED}`);
    
    try {
      const response1 = await axios.post(API_URL, {
        url: TEST_URL_BLOCKED,
        formats: ['markdown']
      }, {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      // If team has respectRobotsOnScrapes enabled, this should fail
      // If not enabled, this should succeed
      console.log('Response status:', response1.status);
      console.log('Success:', response1.data.success);
      
      if (response1.data.success) {
        console.log('✓ Scrape succeeded (robots.txt not being respected - flag likely disabled)\n');
      }
    } catch (error) {
      if (error.response && error.response.data && error.response.data.error) {
        if (error.response.data.error.includes('robots.txt')) {
          console.log('✓ Scrape blocked by robots.txt (flag is enabled and working correctly)\n');
        } else {
          console.log('✗ Scrape failed with unexpected error:', error.response.data.error, '\n');
        }
      } else {
        console.log('✗ Request failed:', error.message, '\n');
      }
    }

    // Test 2: Scrape an allowed URL (should always succeed)
    console.log('Test 2: Scraping a URL that should be allowed by robots.txt...');
    console.log(`URL: ${TEST_URL_ALLOWED}`);
    
    try {
      const response2 = await axios.post(API_URL, {
        url: TEST_URL_ALLOWED,
        formats: ['markdown']
      }, {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('Response status:', response2.status);
      console.log('Success:', response2.data.success);
      
      if (response2.data.success) {
        console.log('✓ Scrape succeeded (as expected)\n');
      }
    } catch (error) {
      console.log('✗ Scrape failed unexpectedly:', error.response?.data?.error || error.message, '\n');
    }

  } catch (error) {
    console.error('Test failed with error:', error.message);
  }
}

// Run the test
testRobotsTxtRespect();

console.log(`
Note: This test assumes your team has the 'respectRobotsOnScrapes' flag enabled.
If the flag is not enabled, all scrapes will succeed regardless of robots.txt.
To enable this flag, contact Firecrawl support or update your team settings in the database.
`);