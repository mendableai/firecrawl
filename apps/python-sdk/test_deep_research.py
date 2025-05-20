"""
Test script for the deep_research method with the new camelCase to snake_case conversion.
"""
from firecrawl import FirecrawlApp

firecrawl = FirecrawlApp(api_key="your_api_key")


def on_activity(activity):
    print(f"[{activity.type}] {activity.message}")

results = firecrawl.deep_research(
    query="What are the latest developments in quantum computing?",
    max_depth=5,
    time_limit=180,
    max_urls=15,
    on_activity=on_activity
)

print(f"Final Analysis: {results.data.final_analysis}")
print(f"Sources: {len(results.data.sources)} references")

print("\nAll available fields in the response:")
print(f"Success: {results.success}")
print(f"Status: {results.status}")
print(f"Current Depth: {results.current_depth}")
print(f"Max Depth: {results.max_depth}")
print(f"Activities: {len(results.activities)} activities")
print(f"Summaries: {len(results.summaries)} summaries")
