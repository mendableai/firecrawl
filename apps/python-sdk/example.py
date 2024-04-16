from firecrawl import FirecrawlApp


app = FirecrawlApp(api_key="YOUR_API_KEY")

crawl_result = app.crawl_url('mendable.ai', {'crawlerOptions': {'excludes': ['blog/*']}})
print(crawl_result[0]['markdown'])

job_id = crawl_result['jobId']
print(job_id)

status = app.check_crawl_status(job_id)
print(status)
