/**
 * v0 by Vercel.
 * @see https://v0.dev/t/MHqslFy8CCr
 * Documentation: https://v0.dev/docs#integrating-generated-code-into-your-nextjs-app
 */
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { JSX, SVGProps } from "react";

export default function StartIngestion() {
  const [url, setUrl] = useState("");
  const [crawlSubPages, setCrawlSubPages] = useState(true);
  const [limit, setLimit] = useState("10");
  const [maxDepth, setMaxDepth] = useState("5");
  const [excludePaths, setExcludePaths] = useState("");
  const [includePaths, setIncludePaths] = useState("");
  const [extractMainContent, setExtractMainContent] = useState(true);

  const handleSubmit = async () => {
    const body = {
      url,
      crawlSubPages,
      limit: parseInt(limit),
      maxDepth: parseInt(maxDepth),
      excludePaths,
      includePaths,
      extractMainContent,
    };
    try {
      const response = await fetch("/api/ingestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new TypeError("Oops, we haven't got JSON!");
      }

      const data = await response.json();
      console.log(data);
      if (data.success) {
        console.log("Ingestion started:", data);
        // Handle successful response (e.g., show a success message, redirect, etc.)
      } else {
        console.error("Ingestion failed:", data.message);
        // Handle error (e.g., show error message to user)
      }
    } catch (error) {
      console.error("Error submitting ingestion request:", error);
      // Handle error (e.g., show error message to user)
    }
    console.log(body);
  };
  return (
    <div className="max-w-2xl mx-auto p-4">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <span>Extract web content with Firecrawl 🔥</span>
          </CardTitle>
          <Link
            href="https://docs.firecrawl.dev/introduction"
            className="text-sm text-blue-500"
            prefetch={false}
          >
            Firecrawl docs
          </Link>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="https://docs.dify.ai"
            className="w-full"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <div className="flex items-center space-x-2">
            <Button variant="default" onClick={handleSubmit}>
              Run
            </Button>
            <Button variant="ghost" className="ml-auto">
              <SettingsIcon className="h-5 w-5" />
            </Button>
          </div>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="crawl-sub-pages"
                checked={crawlSubPages}
                onCheckedChange={(checked) =>
                  setCrawlSubPages(checked as boolean)
                }
              />
              <label htmlFor="crawl-sub-pages" className="text-sm">
                Crawl sub-pages
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="limit">Limit *</Label>
                <Input
                  id="limit"
                  placeholder="10"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="max-depth">Max depth</Label>
                <Input
                  id="max-depth"
                  placeholder="5"
                  value={maxDepth}
                  onChange={(e) => setMaxDepth(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="exclude-paths">Exclude paths</Label>
                <Input
                  id="exclude-paths"
                  placeholder="blog/, /about/"
                  value={excludePaths}
                  onChange={(e) => setExcludePaths(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="include-paths">Include only paths</Label>
                <Input
                  id="include-paths"
                  placeholder="articles/"
                  value={includePaths}
                  onChange={(e) => setIncludePaths(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="extract-main-content"
                checked={extractMainContent}
                onCheckedChange={(checked) =>
                  setExtractMainContent(checked as boolean)
                }
              />
              <label htmlFor="extract-main-content" className="text-sm">
                Extract only main content (no headers, navs, footers, etc.)
              </label>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button disabled variant="default">
            Next
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function SettingsIcon(
  props: JSX.IntrinsicAttributes & SVGProps<SVGSVGElement>
) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
