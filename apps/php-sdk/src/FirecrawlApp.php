<?php

namespace Firecrawl;

use Firecrawl\FirecrawlException;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;
use Psr\Log\LoggerInterface;

class FirecrawlApp {
    public const API_VERSION = "v1";
    public const CRAWL_URL = "/".self::API_VERSION."/crawl/";
    public const SCRAP_URL = "/".self::API_VERSION."/scrape/";
    private $apiKey;
    private $apiUrl;
    public $client;
    private $logger;

    /**
     * FirecrawlApp constructor.
     *
     * @param string|null $apiKey Your Firecrawl API key.
     * @param string $apiUrl The base URL of the Firecrawl API.
     * @param LoggerInterface|null $logger PSR-4 compliant logger (optional).
     *
     * @throws FirecrawlException If no API key is provided.
     */
    public function __construct(
        string $apiKey = null,
        string $apiUrl = 'https://api.firecrawl.dev',
        LoggerInterface $logger = null
    ) {
        $this->apiKey = $apiKey ?: getenv('FIRECRAWL_API_KEY');
        $this->apiUrl = $apiUrl ?: getenv('FIRECRAWL_API_URL', 'https://api.firecrawl.dev');

        // If no logger is provided, use a default one (e.g., Monolog with StreamHandler)
        if (!$logger) {
            $logger = new \Monolog\Logger('firecrawl_default');
            $logger->pushHandler(new \Monolog\Handler\StreamHandler('php://stdout', \Monolog\Level::Debug));
        }

        $this->logger = $logger;

        if (!$this->apiKey) {
            $this->logger->error('No API key provided.');
            throw new FirecrawlException('No API key provided');
        }

        $this->client = new Client([
            'base_uri' => $this->apiUrl,
            'headers' => ['Authorization' => 'Bearer ' . $this->apiKey, 'Content-Type' => 'application/json']
        ]);
    }

    /**
     * Scrape a URL.
     *
     * @param string $url The URL to scrape.
     * @param array|null $params Additional parameters.
     * @return mixed Scraped data.
     *
     * @throws FirecrawlException If scraping fails.
     */
    public function scrapeUrl(string $url, ?array $params = []): mixed {
        $scrapeParams = array_merge(['url' => $url], $params);
        $this->logger->info("Starting scrape for URL: $url");

        try {
            $response = $this->client->post(self::SCRAP_URL, ['json' => $scrapeParams]);
            $data = json_decode($response->getBody(), true);

            if (!$data['success']) {
                $this->logger->error("Scrape failed for URL: $url with error: " . $data['error']);
                throw new FirecrawlException('Failed to scrape URL: ' . $data['error']);
            }

            $this->logger->info("Scrape successful for URL: $url");
            return $data['data'];
        } catch (RequestException $e) {
            $this->logger->error("HTTP error during scrape for URL: $url - " . $e->getMessage());
            throw new FirecrawlException('HTTP Error: ' . $e->getMessage());
        }
    }

    /**
     * Initiate a crawl for a URL.
     *
     * @param string $url The URL to crawl.
     * @param array|null $params Additional parameters.
     * @param int|null $pollInterval Time between status checks.
     * @return mixed Crawl results.
     *
     * @throws FirecrawlException If the crawl job initiation fails.
     */
    public function crawlUrl(
        string $url,
        ?array $params = [],
        ?int $pollInterval = 2
    ): mixed {
        $crawlParams = array_merge(['url' => $url], $params);
        $this->logger->info("Starting crawl for URL: $url");

        try {
            $response = $this->client->post(self::CRAWL_URL, ['json' => $crawlParams]);
            $data = json_decode($response->getBody(), true);

            if (!isset($data['id'])) {
                $this->logger->error("Failed to initiate crawl for URL: $url");
                throw new FirecrawlException('Crawl job initiation failed');
            }

            $this->logger->info("Crawl initiated successfully for URL: $url, Job ID: " . $data['id']);
            return $this->monitorJobStatus($data['id'], $pollInterval);
        } catch (RequestException $e) {
            $this->logger->error("HTTP error during crawl for URL: $url - " . $e->getMessage());
            throw new FirecrawlException('HTTP Error: ' . $e->getMessage());
        }
    }

    /**
     * Monitor the status of a crawl job until completion.
     *
     * @param int $jobId The job ID.
     * @param int $pollInterval Time between status checks.
     * @return mixed Crawl results.
     *
     * @throws FirecrawlException If the job fails.
     */
    public function monitorJobStatus(int $jobId, int $pollInterval): mixed {
        $this->logger->info("Monitoring crawl job: $jobId");

        while (true) {
            sleep($pollInterval);

            try {
                $response = $this->client->get(self::CRAWL_URL . $jobId);
                $data = json_decode($response->getBody(), true);

                if ($data['status'] === 'completed') {
                    $this->logger->info("Crawl job completed successfully: $jobId");
                    return $data['data'];
                } elseif (in_array($data['status'], ['failed', 'stopped'])) {
                    $this->logger->error("Crawl job $jobId failed with status: " . $data['status']);
                    throw new FirecrawlException('Crawl job failed with status: ' . $data['status']);
                }
            } catch (RequestException $e) {
                $this->logger->error("HTTP error while monitoring job: $jobId - " . $e->getMessage());
                throw new FirecrawlException('HTTP Error: ' . $e->getMessage());
            }
        }
    }

    /**
     * Check the status of a crawl job.
     *
     * @param int $jobId The job ID.
     * @return mixed Crawl job status.
     */
    public function checkCrawlStatus(int $jobId): mixed {
        $this->logger->info("Checking status for crawl job: $jobId");

        $response = $this->client->get(self::CRAWL_URL . $jobId);
        $responseBody = json_decode($response->getBody(), true);

        return $responseBody;
    }

    /**
     * Cancel a crawl job.
     *
     * @param int $jobId The job ID to cancel.
     * @return mixed API response.
     */
    public function cancelCrawl(int $jobId): mixed {
        $this->logger->info("Canceling crawl job: $jobId");

        $response = $this->client->delete(self::CRAWL_URL . $jobId);
        $responseBody = json_decode($response->getBody(), true);

        return $responseBody;
    }
}
