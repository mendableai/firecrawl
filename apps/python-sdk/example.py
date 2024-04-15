from firecrawl import FirecrawlApp


app = FirecrawlApp(api_key="a6a2d63a-ed2b-46a9-946d-2a7207efed4d")

crawl_result = app.crawl_url('mendable.ai', {'crawlerOptions': {'excludes': ['blog/*']}})
print(crawl_result[0]['markdown'])

job_id = crawl_result['jobId']
print(job_id)

status = app.check_crawl_status(job_id)
print(status)
