import { useState, ChangeEvent, FormEvent, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

// Hardcoded values (not recommended for production)
const FIRECRAWL_API_URL = "https://api.firecrawl.dev"; // Replace with your actual API URL whether it is local or using Firecrawl Cloud
const FIRECRAWL_API_KEY = ""; // Replace with your actual API key

interface FormData {
  url: string;
  crawlSubPages: boolean;
  limit: string;
  maxDepth: string;
  excludePaths: string;
  includePaths: string;
  extractMainContent: boolean;
}

interface CrawlerOptions {
  includes?: string[];
  excludes?: string[];
  maxDepth?: number;
  limit?: number;
  returnOnlyUrls: boolean;
}

interface PageOptions {
  onlyMainContent: boolean;
}

interface RequestBody {
  url: string;
  crawlerOptions?: CrawlerOptions;
  pageOptions: PageOptions;
}

interface ScrapeResultMetadata {
  title: string;
  description: string;
  language: string;
  sourceURL: string;
  pageStatusCode: number;
  pageError?: string;
  [key: string]: string | number | undefined;
}

interface ScrapeResultData {
  markdown: string;
  content: string;
  html: string;
  rawHtml: string;
  metadata: ScrapeResultMetadata;
  llm_extraction: Record<string, unknown>;
  warning?: string;
}

interface ScrapeResult {
  success: boolean;
  data: ScrapeResultData;
}

export default function FirecrawlComponent() {
  const [formData, setFormData] = useState<FormData>({
    url: "",
    crawlSubPages: false,
    limit: "",
    maxDepth: "",
    excludePaths: "",
    includePaths: "",
    extractMainContent: false,
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [scrapingSelectedLoading, setScrapingSelectedLoading] =
    useState<boolean>(false);
  const [crawledUrls, setCrawledUrls] = useState<string[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [scrapeResults, setScrapeResults] = useState<
    Record<string, ScrapeResult>
  >({});
  const [isCollapsibleOpen, setIsCollapsibleOpen] = useState(true);
  const [crawlStatus, setCrawlStatus] = useState<{
    current: number;
    total: number | null;
  }>({ current: 0, total: null });
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [showCrawlStatus, setShowCrawlStatus] = useState<boolean>(false);
  const [isScraping, setIsScraping] = useState<boolean>(false);
  const [showAllUrls, setShowAllUrls] = useState<boolean>(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (loading) {
      setShowCrawlStatus(true);
      timer = setInterval(() => {
        setElapsedTime((prevTime) => prevTime + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [loading]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setIsCollapsibleOpen(false);
    setElapsedTime(0);
    setCrawlStatus({ current: 0, total: null });
    setIsScraping(!formData.crawlSubPages);
    setCrawledUrls([]);
    setSelectedUrls([]);
    setScrapeResults({});
    setScrapingSelectedLoading(false);
    setShowCrawlStatus(false);

    try {
      const endpoint = `${FIRECRAWL_API_URL}/v0/${
        formData.crawlSubPages ? "crawl" : "scrape"
      }`;

      const requestBody: RequestBody = formData.crawlSubPages
        ? {
            url: formData.url,
            crawlerOptions: {
              includes: formData.includePaths
                ? formData.includePaths.split(",").map((p) => p.trim())
                : undefined,
              excludes: formData.excludePaths
                ? formData.excludePaths.split(",").map((p) => p.trim())
                : undefined,
              maxDepth: formData.maxDepth
                ? parseInt(formData.maxDepth)
                : undefined,
              limit: formData.limit ? parseInt(formData.limit) : undefined,
              returnOnlyUrls: true,
            },
            pageOptions: {
              onlyMainContent: formData.extractMainContent,
            },
          }
        : {
            url: formData.url,
            pageOptions: {
              onlyMainContent: formData.extractMainContent,
            },
          };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
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
          let statusData: {
            status: string;
            data?: { url: string }[];
            current?: number;
            total?: number;
          };
          do {
            const statusResponse = await fetch(statusEndpoint, {
              headers: {
                Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
              },
            });
            if (statusResponse.ok) {
              statusData = await statusResponse.json();

              const urls = statusData.data
                ? statusData.data.map((urlObj) => urlObj.url)
                : [];
              setCrawledUrls(urls);
              setSelectedUrls(urls);
              setCrawlStatus({
                current: urls.length || 0,
                total: urls.length || null,
              });
              if (statusData.status !== "completed") {
                // Wait for 1 second before polling again
                await new Promise((resolve) => setTimeout(resolve, 1000));
                console.log("Polling again...");
                console.log(statusData);
              } else {
                console.log("Crawl completed with status:", statusData.status);
                console.log(statusData);
              }
            } else {
              console.error("Failed to fetch crawl status");
              break;
            }
          } while (statusData.status !== "completed");
        } else {
          console.error("No jobId received from crawl request");
        }
      } else {
        setScrapeResults({ [formData.url]: data });
        setCrawlStatus({ current: 1, total: 1 });
      }
    } catch (error) {
      console.error("Error:", error);
      setScrapeResults({
        error: {
          success: false,
          data: {
            metadata: {
              pageError: "Error occurred while fetching data",
              title: "",
              description: "",
              language: "",
              sourceURL: "",
              pageStatusCode: 0,
            },
            markdown: "",
            content: "",
            html: "",
            rawHtml: "",
            llm_extraction: {},
          },
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const handleScrapeSelected = async () => {
    setLoading(true);
    setElapsedTime(0);
    setCrawlStatus({ current: 0, total: selectedUrls.length });
    setIsScraping(true);
    setScrapingSelectedLoading(true);
    const newScrapeResults: Record<string, ScrapeResult> = {};

    for (const [index, url] of selectedUrls.entries()) {
      try {
        const response = await fetch(`${FIRECRAWL_API_URL}/v0/scrape`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: url,
            pageOptions: {
              onlyMainContent: formData.extractMainContent,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: ScrapeResult = await response.json();
        newScrapeResults[url] = data;
        setCrawlStatus((prev) => ({ ...prev, current: index + 1 }));
      } catch (error) {
        console.error(`Error scraping ${url}:`, error);
        newScrapeResults[url] = {
          success: false,
          data: {
            markdown: "",
            content: "",
            html: "",
            rawHtml: "",
            metadata: {
              title: "",
              description: "",
              language: "",
              sourceURL: url,
              pageStatusCode: 0,
              pageError: (error as Error).message,
            },
            llm_extraction: {},
          },
        };
      }
    }

    setScrapeResults(newScrapeResults);
    setLoading(false);
    setIsScraping(false);
  };

  return (
    <div className="max-w-2xl mx-auto p-4">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <span>Extract web content with Firecrawl 🔥</span>
          </CardTitle>
          <div className="text-sm text-gray-500 w-11/12 items-center">
            Use this component to quickly build your own UI for Firecrawl. Plug
            in your API key and the component will handle the rest. Learn more
            on the{" "}
            <a
              href="https://docs.firecrawl.dev/"
              className="text-sm text-blue-500"
            >
              Firecrawl docs!
            </a>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit}>
            <div className="flex items-center space-x-2">
              <Input
                placeholder="https://www.firecrawl.dev/"
                className="flex-grow"
                name="url"
                value={formData.url}
                onChange={handleChange}
              />
              <Button type="submit" variant="default" disabled={loading}>
                {loading ? "Running..." : "Run"}
              </Button>
            </div>
            <Collapsible
              open={isCollapsibleOpen}
              onOpenChange={setIsCollapsibleOpen}
              className="mt-2"
            >
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between pl-2">
                  Advanced Options
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 mt-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="crawlSubPages"
                    name="crawlSubPages"
                    checked={formData.crawlSubPages}
                    onCheckedChange={(checked: boolean) =>
                      setFormData((prev) => ({
                        ...prev,
                        crawlSubPages: checked,
                      }))
                    }
                  />
                  <label htmlFor="crawlSubPages" className="text-sm">
                    Crawl sub-pages
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label
                      htmlFor="limit"
                      className="block text-left w-full pb-2"
                    >
                      Limit *
                    </Label>
                    <Input
                      id="limit"
                      name="limit"
                      placeholder="10"
                      value={formData.limit}
                      onChange={handleChange}
                    />
                  </div>
                  <div>
                    <Label
                      htmlFor="maxDepth"
                      className="block text-left w-full pb-2"
                    >
                      Max depth
                    </Label>
                    <Input
                      id="maxDepth"
                      name="maxDepth"
                      placeholder="5"
                      value={formData.maxDepth}
                      onChange={handleChange}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label
                      htmlFor="excludePaths"
                      className="block text-left w-full pb-2"
                    >
                      Exclude paths
                    </Label>
                    <Input
                      id="excludePaths"
                      name="excludePaths"
                      placeholder="blog/, /about/"
                      value={formData.excludePaths}
                      onChange={handleChange}
                    />
                  </div>
                  <div>
                    <Label
                      htmlFor="includePaths"
                      className="block text-left w-full pb-2"
                    >
                      Include only paths
                    </Label>
                    <Input
                      id="includePaths"
                      name="includePaths"
                      placeholder="articles/"
                      value={formData.includePaths}
                      onChange={handleChange}
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="extractMainContent"
                    name="extractMainContent"
                    checked={formData.extractMainContent}
                    onCheckedChange={(checked: boolean) =>
                      setFormData((prev) => ({
                        ...prev,
                        extractMainContent: checked,
                      }))
                    }
                  />
                  <label htmlFor="extractMainContent" className="text-sm">
                    Extract only main content (no headers, navs, footers, etc.)
                  </label>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </form>
          {showCrawlStatus && (
            <div className="flex items-center justify-between mb-2 space-x-2 bg-gray-100 p-2 rounded-md">
              <div className="flex items-center space-x-2">
                {!isScraping &&
                  crawledUrls.length > 0 &&
                  !scrapingSelectedLoading && (
                    <>
                      <Checkbox
                        id="selectAll"
                        checked={selectedUrls.length === crawledUrls.length}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedUrls([...crawledUrls]);
                          } else {
                            setSelectedUrls([]);
                          }
                        }}
                      />
                      <label
                        htmlFor="selectAll"
                        className="text-sm cursor-pointer"
                      >
                        {selectedUrls.length === crawledUrls.length
                          ? "Unselect All"
                          : "Select All"}
                      </label>
                    </>
                  )}
              </div>
              <div className="text-sm text-gray-600">
                {isScraping
                  ? `Scraped ${crawlStatus.current} page(s) in ${elapsedTime}s`
                  : `Crawled ${crawlStatus.current} pages in ${elapsedTime}s`}
              </div>
            </div>
          )}

          {crawledUrls.length > 0 &&
            !scrapingSelectedLoading &&
            !isScraping && (
              <>
                <ul className="pl-2">
                  {(showAllUrls ? crawledUrls : crawledUrls.slice(0, 10)).map(
                    (url, index) => (
                      <li key={index} className="flex items-center space-x-2">
                        <Checkbox
                          checked={selectedUrls.includes(url)}
                          onCheckedChange={() =>
                            setSelectedUrls((prev) =>
                              prev.includes(url)
                                ? prev.filter((u) => u !== url)
                                : [...prev, url]
                            )
                          }
                        />
                        <span>{url}</span>
                      </li>
                    )
                  )}
                </ul>
                {crawledUrls.length > 10 && (
                  <div className="flex justify-center mt-2">
                    <Button
                      variant="link"
                      onClick={() => setShowAllUrls(!showAllUrls)}
                    >
                      {showAllUrls ? "Show Less" : "Show All"}
                    </Button>
                  </div>
                )}
              </>
            )}
        </CardContent>
        <CardFooter className="flex justify-center">
          {crawledUrls.length > 0 && !scrapingSelectedLoading && (
            <Button
              variant="default"
              onClick={handleScrapeSelected}
              disabled={loading || selectedUrls.length === 0}
            >
              Scrape Selected URLs
            </Button>
          )}
        </CardFooter>
      </Card>

      {Object.keys(scrapeResults).length > 0 && (
        <div className="mt-4">
          <h2 className="text-2xl font-bold mb-4">Scrape Results</h2>
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(scrapeResults).map(([url, result]) => (
              <Card key={url} className="overflow-hidden">
                <CardContent>
                  <div className="max-h-60 overflow-y-auto">
                    <div className="text-base font-bold py-2">
                      {url
                        .replace(/^(https?:\/\/)?(www\.)?/, "")
                        .replace(/\/$/, "")}
                    </div>
                    {result.success ? (
                      <>
                        <pre className="text-xs whitespace-pre-wrap">
                          {result.data.markdown.trim().slice(0, 200)}...
                        </pre>
                      </>
                    ) : (
                      <p className="text-red-500">Failed to scrape this URL</p>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(event) => {
                      navigator.clipboard.writeText(result.data.markdown);
                      const button = event.currentTarget as HTMLButtonElement;
                      const originalText = button.textContent;
                      button.textContent = "Copied!";
                      setTimeout(() => {
                        button.textContent = originalText;
                      }, 2000);
                    }}
                  >
                    Copy Markdown
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
