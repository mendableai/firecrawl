from firecrawl import FirecrawlApp

app = FirecrawlApp(api_key="fc-fb63db6e33ca4fddb5d72b48a043ef03")

# Crawl a website:
crawl_status = app.crawl_url(
  'https://www.firecrawl.dev/app/playground', 
  params={
    'limit': 100, 
    'scrapeOptions': {'formats': ['markdown', 'html']}
  },
  poll_interval=30
)
print(crawl_status)