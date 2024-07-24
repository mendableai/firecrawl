import logo from './logo.svg';
import './App.css';

import React, { useState } from 'react';

// Hardcoded values (not recommended for production)
const FIRECRAWL_API_URL = 'http://localhost:3002'; // Replace with actual URL
const FIRECRAWL_API_KEY = 'fc-fa95acf54c0e496fbe6b403745f246ab'; // Replace with your actual API key

function App() {
  const [formData, setFormData] = useState({
    url: '',
    crawlSubPages: false,
    limit: '',
    maxDepth: '',
    excludePaths: '',
    includePaths: '',
    extractMainContent: false,
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [crawledUrls, setCrawledUrls] = useState([]);
  const [selectedUrls, setSelectedUrls] = useState([]);
  const [scrapeResults, setScrapeResults] = useState({});

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prevData => ({
      ...prevData,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleUrlSelection = (url) => {
    setSelectedUrls(prev => 
      prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    console.log(formData);

    try {
      const endpoint = `${FIRECRAWL_API_URL}/v0/${formData.crawlSubPages ? 'crawl' : 'scrape'}`;

      const requestBody = formData.crawlSubPages ? {
        url: formData.url,
        crawlerOptions: {
          includes: formData.includePaths ? formData.includePaths.split(',').map(p => p.trim()) : undefined,
          excludes: formData.excludePaths ? formData.excludePaths.split(',').map(p => p.trim()) : undefined,
          maxDepth: formData.maxDepth ? parseInt(formData.maxDepth) : undefined,
          limit: formData.limit ? parseInt(formData.limit) : undefined,
          returnOnlyUrls: true,
        },
        pageOptions: {
          onlyMainContent: formData.extractMainContent,
        }
      } : {
        url: formData.url,
        pageOptions: {
          onlyMainContent: formData.extractMainContent,
        }
      };
      

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (formData.crawlSubPages) {
        const jobId = data.jobId;
        if (jobId) {
          const statusEndpoint = `${FIRECRAWL_API_URL}/v0/crawl/status/${jobId}`;
          let statusData;
          do {
            const statusResponse = await fetch(statusEndpoint, {
              headers: {
                'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
              },
            });
            if (statusResponse.ok) {
              statusData = await statusResponse.json();
              
              const urls = statusData.data ? statusData.data.map(urlObj => urlObj.url) : [];
              setCrawledUrls(urls);
              setSelectedUrls(urls);
              if (statusData.status !== 'completed') {
                // Wait for 5 seconds before polling again
                await new Promise(resolve => setTimeout(resolve, 5000));
              }
            } else {
              console.error('Failed to fetch crawl status');
              break;
            }
          } while (statusData.status !== 'completed');
        } else {
          console.error('No jobId received from crawl request');
        }
      } else {
        setResult(data);
      }
    } catch (error) {
      console.error('Error:', error);
      setResult({ success: false, message: 'Error occurred while fetching data' });
    } finally {
      setLoading(false);
    }
  };

  const handleScrapeSelected = async () => {
    setLoading(true);
    const newScrapeResults = {};

    for (const url of selectedUrls) {
      try {
        const response = await fetch(`${FIRECRAWL_API_URL}/v0/scrape`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: url,
            pageOptions: {
              onlyMainContent: formData.extractMainContent,
            }
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        newScrapeResults[url] = data;
      } catch (error) {
        console.error(`Error scraping ${url}:`, error);
        newScrapeResults[url] = { error: error.message };
      }
    }

    setScrapeResults(newScrapeResults);
    setLoading(false);
  };

  return (
    <div className="App">
      <h1>Firecrawl API Demo</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label>
            URL:
            <input
              type="url"
              name="url"
              value={formData.url}
              onChange={handleChange}
              required
            />
          </label>
        </div>
        <div>
          <label>
            Crawl Sub Pages:
            <input
              type="checkbox"
              name="crawlSubPages"
              checked={formData.crawlSubPages}
              onChange={handleChange}
            />
          </label>
        </div>
        <div>
          <label>
            Limit:
            <input
              type="number"
              name="limit"
              value={formData.limit}
              onChange={handleChange}
            />
          </label>
        </div>
        <div>
          <label>
            Max Depth:
            <input
              type="number"
              name="maxDepth"
              value={formData.maxDepth}
              onChange={handleChange}
            />
          </label>
        </div>
        <div>
          <label>
            Exclude Paths:
            <input
              type="text"
              name="excludePaths"
              value={formData.excludePaths}
              onChange={handleChange}
            />
          </label>
        </div>
        <div>
          <label>
            Include Paths:
            <input
              type="text"
              name="includePaths"
              value={formData.includePaths}
              onChange={handleChange}
            />
          </label>
        </div>
        <div>
          <label>
            Extract Main Content:
            <input
              type="checkbox"
              name="extractMainContent"
              checked={formData.extractMainContent}
              onChange={handleChange}
            />
          </label>
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Loading...' : 'Submit'}
        </button>
      </form>
      {formData.crawlSubPages && crawledUrls.length > 0 && (
        <div>
          <h2>Crawled URLs:</h2>
          <ul>
            {crawledUrls.map((url, index) => (
              <li key={index}>
                <label>
                  <input
                    type="checkbox"
                    checked={selectedUrls.includes(url)}
                    onChange={() => handleUrlSelection(url)}
                  />
                  {url}
                </label>
              </li>
            ))}
          </ul>
          <button onClick={handleScrapeSelected} disabled={loading || selectedUrls.length === 0}>
            {loading ? 'Scraping...' : 'Scrape Selected URLs'}
          </button>
        </div>
      )}
      {!formData.crawlSubPages && result && (
        <div>
          <h2>Result:</h2>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
      {Object.keys(scrapeResults).length > 0 && (
        <div>
          <h2>Scrape Results:</h2>
          {Object.entries(scrapeResults).map(([url, result]) => (
            <div key={url}>
              <h3>{url}</h3>
              <pre>{JSON.stringify(result, null, 2)}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
