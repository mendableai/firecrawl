package firecrawl

import (
	"log"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/joho/godotenv"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var API_URL string
var TEST_API_KEY string

func init() {
	err := godotenv.Load("../.env")
	if err != nil {
		log.Fatalf("Error loading .env file: %v", err)
	}
	API_URL = os.Getenv("API_URL")
	TEST_API_KEY = os.Getenv("TEST_API_KEY")
}

func TestNoAPIKey(t *testing.T) {
	_, err := NewFirecrawlApp("", API_URL)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "no API key provided")
}

func TestScrapeURLInvalidAPIKey(t *testing.T) {
	app, err := NewFirecrawlApp("invalid_api_key", API_URL)
	require.NoError(t, err)

	_, err = app.ScrapeURL("https://firecrawl.dev", nil)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "Unexpected error during scrape URL: Status code 401. Unauthorized: Invalid token")
}

func TestBlocklistedURL(t *testing.T) {
	app, err := NewFirecrawlApp(TEST_API_KEY, API_URL)
	require.NoError(t, err)

	_, err = app.ScrapeURL("https://facebook.com/fake-test", nil)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "Unexpected error during scrape URL: Status code 403. Firecrawl currently does not support social media scraping due to policy restrictions.")
}

func TestSuccessfulResponseWithValidPreviewToken(t *testing.T) {
	app, err := NewFirecrawlApp("this_is_just_a_preview_token", API_URL)
	require.NoError(t, err)

	response, err := app.ScrapeURL("https://roastmywebsite.ai", nil)
	require.NoError(t, err)
	assert.NotNil(t, response)

	assert.Contains(t, response.Content, "_Roast_")
}

func TestScrapeURLE2E(t *testing.T) {
	app, err := NewFirecrawlApp(TEST_API_KEY, API_URL)
	require.NoError(t, err)

	response, err := app.ScrapeURL("https://roastmywebsite.ai", nil)
	require.NoError(t, err)
	assert.NotNil(t, response)

	assert.Contains(t, response.Content, "_Roast_")
	assert.NotEqual(t, response.Markdown, "")
	assert.NotNil(t, response.Metadata)
	assert.Equal(t, response.HTML, "")
}

func TestSuccessfulResponseWithValidAPIKeyAndIncludeHTML(t *testing.T) {
	app, err := NewFirecrawlApp(TEST_API_KEY, API_URL)
	require.NoError(t, err)

	params := map[string]any{
		"pageOptions": map[string]any{
			"includeHtml": true,
		},
	}
	response, err := app.ScrapeURL("https://roastmywebsite.ai", params)
	require.NoError(t, err)
	assert.NotNil(t, response)

	assert.Contains(t, response.Content, "_Roast_")
	assert.Contains(t, response.Markdown, "_Roast_")
	assert.Contains(t, response.HTML, "<h1")
	assert.NotNil(t, response.Metadata)
}

func TestSuccessfulResponseForValidScrapeWithPDFFile(t *testing.T) {
	app, err := NewFirecrawlApp(TEST_API_KEY, API_URL)
	require.NoError(t, err)

	response, err := app.ScrapeURL("https://arxiv.org/pdf/astro-ph/9301001.pdf", nil)
	require.NoError(t, err)
	assert.NotNil(t, response)

	assert.Contains(t, response.Content, "We present spectrophotometric observations of the Broad Line Radio Galaxy")
	assert.NotNil(t, response.Metadata)
}

func TestSuccessfulResponseForValidScrapeWithPDFFileWithoutExplicitExtension(t *testing.T) {
	app, err := NewFirecrawlApp(TEST_API_KEY, API_URL)
	require.NoError(t, err)

	response, err := app.ScrapeURL("https://arxiv.org/pdf/astro-ph/9301001", nil)
	time.Sleep(6 * time.Second) // wait for 6 seconds
	require.NoError(t, err)
	assert.NotNil(t, response)

	assert.Contains(t, response.Content, "We present spectrophotometric observations of the Broad Line Radio Galaxy")
	assert.NotNil(t, response.Metadata)
}

func TestCrawlURLInvalidAPIKey(t *testing.T) {
	app, err := NewFirecrawlApp("invalid_api_key", API_URL)
	require.NoError(t, err)

	_, err = app.CrawlURL("https://firecrawl.dev", nil, false, 2, "")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "Unexpected error during start crawl job: Status code 401. Unauthorized: Invalid token")
}

func TestShouldReturnErrorForBlocklistedURL(t *testing.T) {
	app, err := NewFirecrawlApp(TEST_API_KEY, API_URL)
	require.NoError(t, err)

	_, err = app.CrawlURL("https://twitter.com/fake-test", nil, false, 2, "")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "Unexpected error during start crawl job: Status code 403. Firecrawl currently does not support social media scraping due to policy restrictions.")
}

func TestCrawlURLWaitForCompletionE2E(t *testing.T) {
	app, err := NewFirecrawlApp(TEST_API_KEY, API_URL)
	require.NoError(t, err)

	params := map[string]any{
		"crawlerOptions": map[string]any{
			"excludes": []string{"blog/*"},
		},
	}
	response, err := app.CrawlURL("https://roastmywebsite.ai", params, true, 2, "")
	require.NoError(t, err)
	assert.NotNil(t, response)

	data, ok := response.([]*FirecrawlDocument)
	assert.True(t, ok)
	assert.Greater(t, len(data), 0)
	assert.Contains(t, data[0].Content, "_Roast_")
}

func TestCrawlURLWithIdempotencyKeyE2E(t *testing.T) {
	app, err := NewFirecrawlApp(TEST_API_KEY, API_URL)
	require.NoError(t, err)

	uniqueIdempotencyKey := uuid.New().String()
	params := map[string]any{
		"crawlerOptions": map[string]any{
			"excludes": []string{"blog/*"},
		},
	}
	response, err := app.CrawlURL("https://roastmywebsite.ai", params, true, 2, uniqueIdempotencyKey)
	require.NoError(t, err)
	assert.NotNil(t, response)

	data, ok := response.([]*FirecrawlDocument)
	assert.True(t, ok)
	assert.Greater(t, len(data), 0)
	assert.Contains(t, data[0].Content, "_Roast_")

	_, err = app.CrawlURL("https://firecrawl.dev", params, true, 2, uniqueIdempotencyKey)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "Conflict: Failed to start crawl job due to a conflict. Idempotency key already used")
}

func TestCheckCrawlStatusE2E(t *testing.T) {
	app, err := NewFirecrawlApp(TEST_API_KEY, API_URL)
	require.NoError(t, err)

	params := map[string]any{
		"crawlerOptions": map[string]any{
			"excludes": []string{"blog/*"},
		},
	}
	response, err := app.CrawlURL("https://firecrawl.dev", params, false, 2, "")
	require.NoError(t, err)
	assert.NotNil(t, response)

	jobID, ok := response.(string)
	assert.True(t, ok)
	assert.NotEqual(t, "", jobID)

	time.Sleep(30 * time.Second) // wait for 30 seconds

	statusResponse, err := app.CheckCrawlStatus(jobID)
	require.NoError(t, err)
	assert.NotNil(t, statusResponse)

	assert.Equal(t, "completed", statusResponse.Status)
	assert.Greater(t, len(statusResponse.Data), 0)
}

func TestSearchE2E(t *testing.T) {
	app, err := NewFirecrawlApp(TEST_API_KEY, API_URL)
	require.NoError(t, err)

	response, err := app.Search("test query", nil)
	require.NoError(t, err)
	assert.NotNil(t, response)

	assert.Greater(t, len(response), 2)
	assert.NotEqual(t, response[0].Content, "")
}

func TestSearchInvalidAPIKey(t *testing.T) {
	app, err := NewFirecrawlApp("invalid_api_key", API_URL)
	require.NoError(t, err)

	_, err = app.Search("test query", nil)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "Unexpected error during search: Status code 401. Unauthorized: Invalid token")
}

func TestLLMExtraction(t *testing.T) {
	app, err := NewFirecrawlApp(TEST_API_KEY, API_URL)
	require.NoError(t, err)

	params := map[string]any{
		"extractorOptions": ExtractorOptions{
			Mode:             "llm-extraction",
			ExtractionPrompt: "Based on the information on the page, find what the company's mission is and whether it supports SSO, and whether it is open source",
			ExtractionSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"company_mission": map[string]string{"type": "string"},
					"supports_sso":    map[string]string{"type": "boolean"},
					"is_open_source":  map[string]string{"type": "boolean"},
				},
				"required": []string{"company_mission", "supports_sso", "is_open_source"},
			},
		},
	}

	response, err := app.ScrapeURL("https://mendable.ai", params)
	require.NoError(t, err)
	assert.NotNil(t, response)

	assert.Contains(t, response.LLMExtraction, "company_mission")
	assert.IsType(t, true, response.LLMExtraction["supports_sso"])
	assert.IsType(t, true, response.LLMExtraction["is_open_source"])
}

func TestCancelCrawlJobInvalidAPIKey(t *testing.T) {
	app, err := NewFirecrawlApp("invalid_api_key", API_URL)
	require.NoError(t, err)

	_, err = app.CancelCrawlJob("test query")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "Unexpected error during cancel crawl job: Status code 401. Unauthorized: Invalid token")
}

func TestCancelNonExistingCrawlJob(t *testing.T) {
	app, err := NewFirecrawlApp(TEST_API_KEY, API_URL)
	require.NoError(t, err)

	jobID := uuid.New().String()
	_, err = app.CancelCrawlJob(jobID)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "Job not found")
}

func TestCancelCrawlJobE2E(t *testing.T) {
	app, err := NewFirecrawlApp(TEST_API_KEY, API_URL)
	require.NoError(t, err)

	response, err := app.CrawlURL("https://firecrawl.dev", nil, false, 2, "")
	require.NoError(t, err)
	assert.NotNil(t, response)

	jobID, ok := response.(string)
	assert.True(t, ok)
	assert.NotEqual(t, "", jobID)

	status, err := app.CancelCrawlJob(jobID)
	require.NoError(t, err)
	assert.Equal(t, "cancelled", status)
}
