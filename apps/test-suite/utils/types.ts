export interface WebsiteScrapeError {
  website: string;
  prompt: string;
  expected_output: string;
  actual_output: string;
  error: string;
}
