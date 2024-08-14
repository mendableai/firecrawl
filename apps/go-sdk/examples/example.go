package main

import (
	"encoding/json"
	"fmt"
	"log"

	"github.com/google/uuid"
	"github.com/mendableai/firecrawl-go"
)

func main() {
	app, err := firecrawl.NewFirecrawlApp("fc-YOUR_API_KEY", "https://api.firecrawl.dev")
	if err != nil {
		log.Fatalf("Failed to create FirecrawlApp: %v", err)
	}

	// Scrape a website
	scrapeResult, err := app.ScrapeURL("firecrawl.dev", nil)
	if err != nil {
		log.Fatalf("Failed to scrape URL: %v", err)
	}
	fmt.Println(scrapeResult.Markdown)

	// Crawl a website
	idempotencyKey := uuid.New().String() // optional idempotency key
	crawlParams := map[string]any{
		"crawlerOptions": map[string]any{
			"excludes": []string{"blog/*"},
		},
	}
	crawlResult, err := app.CrawlURL("mendable.ai", crawlParams, true, 2, idempotencyKey)
	if err != nil {
		log.Fatalf("Failed to crawl URL: %v", err)
	}
	jsonCrawlResult, err := json.MarshalIndent(crawlResult, "", "  ")
	if err != nil {
		log.Fatalf("Failed to marshal crawl result: %v", err)
	}
	fmt.Println(string(jsonCrawlResult))

	// LLM Extraction using JSON schema
	jsonSchema := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"top": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"title":       map[string]string{"type": "string"},
						"points":      map[string]string{"type": "number"},
						"by":          map[string]string{"type": "string"},
						"commentsURL": map[string]string{"type": "string"},
					},
					"required": []string{"title", "points", "by", "commentsURL"},
				},
				"minItems":    5,
				"maxItems":    5,
				"description": "Top 5 stories on Hacker News",
			},
		},
		"required": []string{"top"},
	}

	llmExtractionParams := map[string]any{
		"extractorOptions": firecrawl.ExtractorOptions{
			ExtractionSchema: jsonSchema,
			Mode:             "llm-extraction",
		},
		"pageOptions": map[string]any{
			"onlyMainContent": true,
		},
	}

	llmExtractionResult, err := app.ScrapeURL("https://news.ycombinator.com", llmExtractionParams)
	if err != nil {
		log.Fatalf("Failed to perform LLM extraction: %v", err)
	}

	// Pretty print the LLM extraction result
	jsonResult, err := json.MarshalIndent(llmExtractionResult.LLMExtraction, "", "  ")
	if err != nil {
		log.Fatalf("Failed to marshal LLM extraction result: %v", err)
	}
	fmt.Println(string(jsonResult))
}
