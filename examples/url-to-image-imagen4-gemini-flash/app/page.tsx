"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Download, CheckCircle, Loader2, ClipboardCopy, ExternalLink } from "lucide-react";
import Link from "next/link";
import React from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Define an interface for the image style options
interface ImageStyle {
  id: string;
  name: string;
  src: string;
  alt: string;
  prompt: string;
}

// Define the image style options using the provided images
const imageStyleOptions: ImageStyle[] = [
  {
    id: "style1",
    name: "GHIBLI",
    src: "/url-to-image/1.png",
    alt: "Studio Ghibli art style",
    prompt: "1. Studio Ghibli illustration style\n2. Soft, pastel colors\n3. Hand-drawn aesthetic"
  },
  {
    id: "style2",
    name: "LEGO",
    src: "/url-to-image/2.png",
    alt: "LEGO brick style",
    prompt: "1. LEGO brick construction\n2. Bright, primary colors\n3. Toy-like simplified forms"
  },
  {
    id: "style3",
    name: "CLAYMATION",
    src: "/url-to-image/3.png",
    alt: "Claymation style",
    prompt: "1. Clay-like texture\n2. Stop-motion aesthetic\n3. Slightly imperfect surfaces"
  },
];

// Add proper interface for the error type at the top of the file
// Used for type checking when handling API errors
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiError extends Error {
  status?: number;
}

// Add interface for scrape response
interface ScrapeResponse {
  success: boolean;
  markdown?: string;
  data?: {
    markdown?: string;
  };
  error?: string;
}

// Add interface for the image generation response
interface ImageGenResponse {
  imageBase64?: string;
  contentType?: string;
  error?: string;
}

// Add interface for JSON streaming response chunks
interface StreamingChunk {
  type: 'thinking' | 'text-delta' | 'done';
  value?: string;
  textDelta?: string;
}

// ProgressBar Component (adapted from lead-enrichment page)
const UrlToImageProgressBar = ({ activeStep }: { activeStep: number }) => {
  const steps = [
    { number: 1, title: "Enter URL" },
    { number: 2, title: "Select Style" },
    { number: 3, title: "Website Content" },
    { number: 4, title: "Generate Prompt" },
    { number: 5, title: "Generate Image" },
    { number: 6, title: "View Image" },
  ];

  return (
    <section className="mb-10 pt-2 sm:pt-4">
      <div className="w-full flex justify-between items-center mb-3 sm:mb-4">
        {steps.map((step, index, arr) => (
          <React.Fragment key={step.number}>
            <div className="flex flex-col items-center">
              <div
                className={`h-8 w-8 sm:h-10 sm:w-10 rounded-full flex items-center justify-center font-bold text-md sm:text-lg transition-colors duration-300 ${activeStep >= step.number ? "bg-black text-white dark:bg-gray-300 dark:text-black" : "bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400"}`}
              >
                {step.number}
              </div>
              <span className={`text-xs sm:text-sm mt-1.5 sm:mt-2 transition-colors duration-300 ${activeStep >= step.number ? "text-black dark:text-gray-300 font-semibold" : "text-zinc-500 dark:text-zinc-400"}`}>
                {step.title}
              </span>
            </div>
            {index < arr.length - 1 && (
              <div className={`relative bottom-2 sm:bottom-3 h-1 flex-1 transition-colors duration-300 mx-2 sm:mx-3 ${activeStep > step.number ? "bg-black dark:bg-gray-300" : "bg-zinc-200 dark:bg-zinc-700"}`}></div>
            )}
          </React.Fragment>
        ))}
      </div>
    </section>
  );
};

export default function UrlToImagePage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [url, setUrl] = useState("");
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [websiteContent, setWebsiteContent] = useState<string | null>(null);
  const [isScrapingComplete, setIsScrapingComplete] = useState(false);
  const [thinking, setThinking] = useState<string[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const thinkingRef = useRef<HTMLDivElement>(null);
  const [expandedPromptId, setExpandedPromptId] = useState<string | null>(null);
  const [stylePrompt, setStylePrompt] = useState<string>("");
  const [firecrawlApiKey, setFirecrawlApiKey] = useState<string>("");
  const [hasApiKey, setHasApiKey] = useState<boolean>(false); // Start with false to prevent flashing
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [isCheckingEnv, setIsCheckingEnv] = useState(true); // Add loading state for environment check

  // Add a reference for the content container to prevent page jumping
  // This reference is not being used - removing it
  // const contentContainerRef = useRef<HTMLDivElement>(null);

  // Check if environment variables exist on component mount
  useEffect(() => {
    const checkEnvironmentVariables = async () => {
      try {
        const response = await fetch('/api/check-env');
        const data = await response.json();
        
        // If FIRECRAWL_API_KEY exists in environment variables
        if (data.environmentStatus.FIRECRAWL_API_KEY) {
          setHasApiKey(true);
        } else {
          setHasApiKey(false);
        }
      } catch (error) {
        console.error("Error checking environment variables:", error);
        setHasApiKey(false); // Default to false if check fails
      } finally {
        setIsCheckingEnv(false); // Environment check is complete
      }
    };
    
    checkEnvironmentVariables();
  }, []);

  // Use user-provided API key for the current session only
  const saveApiKey = () => {
    if (firecrawlApiKey.trim()) {
      setHasApiKey(true);
      setShowApiKeyModal(false);
      toast.success("API key saved for this session!");

      // Continue with the workflow - proceed to step 2
      setCurrentStep(2);
    } else {
      toast.error("Please enter a valid API key");
    }
  };

  // Open Firecrawl website in a new tab
  const openFirecrawlWebsite = () => {
    window.open('https://www.firecrawl.dev?utm_source=tool-url-to-website', '_blank');
  };

  const handleUrlSubmit = async () => {
    if (!url) return;
    setError(null);

    // If no API key is available, show the modal instead of proceeding
    if (!hasApiKey) {
      setShowApiKeyModal(true);
    } else {
      // If API key is available, proceed to step 2
      setCurrentStep(2);
    }
  };

  const handleStyleSelect = async (styleId: string) => {
    setSelectedStyleId(styleId);

    // Initialize the style prompt with the selected style's prompt
    const selectedStyle = imageStyleOptions.find(style => style.id === styleId);
    if (selectedStyle) {
      setStylePrompt(selectedStyle.prompt);
    }

    // Clear any saved prompts in session storage to prevent reusing old prompts
    sessionStorage.removeItem('savedPrompt');
    sessionStorage.removeItem('savedStylePrompt');

    setCurrentStep(3);
    setIsLoading(true);
    setGeneratedImage(null);
    setGeneratedPrompt(null);
    setWebsiteContent(null);
    setIsScrapingComplete(false);
    setError(null);
    setThinking([]);

    try {
      // 1. Scrape Website
      setLoadingMessage("Scraping with Firecrawl 🔥...");

      // Prepare headers based on whether we're using env variables or user input
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      // Add the API key header if the user has provided one
      if (firecrawlApiKey) {
        headers['X-Firecrawl-API-Key'] = firecrawlApiKey;
      }

      const scrapeResponse = await fetch('/api/scrape', {
        method: 'POST',
        headers,
        body: JSON.stringify({ url, formats: ['markdown'] })
      });
      if (!scrapeResponse.ok) {
        const errData = await scrapeResponse.json() as ScrapeResponse;
        throw new Error(errData.error || `Scraping failed with status: ${scrapeResponse.status}`);
      }
      const scrapeData = await scrapeResponse.json() as ScrapeResponse;
      // Check for markdown directly at the top level or under data object
      const markdown = scrapeData.markdown || scrapeData.data?.markdown;

      if (!markdown) {
        console.error("Scraping did not return markdown:", scrapeData);
        throw new Error('Failed to get website content (markdown).');
      }

      // Store website content and mark scraping as complete
      setWebsiteContent(markdown);
      setIsScrapingComplete(true);
      setIsLoading(false);

    } catch (err: unknown) {
      console.error("Error in handleStyleSelect:", err);
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      setError(errorMessage);
      setIsLoading(false);
      if (currentStep === 3) {
        setCurrentStep(2);
      }
    }
  };

  const handleGeneratePromptAndImage = async () => {
    if (!websiteContent) return;

    setCurrentStep(4);
    setError(null);

    // Clear any cached prompt
    setGeneratedPrompt("");

    // Check if we have saved prompts from previous session
    const savedPrompt = sessionStorage.getItem('savedPrompt');
    const savedStylePrompt = sessionStorage.getItem('savedStylePrompt');

    if (savedPrompt) {
      // If we have saved prompts, restore them
      setGeneratedPrompt(savedPrompt);
      if (savedStylePrompt) {
        setStylePrompt(savedStylePrompt);
      }
      // Clear the saved prompts to avoid using them again if user starts over
      sessionStorage.removeItem('savedPrompt');
      sessionStorage.removeItem('savedStylePrompt');
      return; // Skip the API call if we have saved prompts
    }

    // Otherwise, generate new prompts
    setIsLoading(true);
    setGeneratedPrompt(""); // Initialize with empty string
    setThinking([]);
    setIsThinking(true);

    try {
      // 2. Generate Image Prompt with Gemini using streaming with thinking steps
      setLoadingMessage("Generating prompt with Gemini-2.5-Flash-Preview-05-20...");

      // Prepare headers based on whether we're using env variables or user input
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      };

      // Add the API key header if the user has provided one
      if (firecrawlApiKey) {
        headers['X-Gemini-API-Key'] = firecrawlApiKey;
      }

      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: `Create ONE coherent sentence as an image generation prompt based on this website:

${websiteContent.substring(0, 3000)}

Your prompt should:
- Be a single, complete sentence (15-25 words maximum)
- Include the main product/service from the website
- Incorporate the website's actual tagline or headline (in quotes)
- Mention a key visual element from the website
- Be formatted as a direct instruction to an image generator

Example of good prompt:
"Create an image of a sleek coffee subscription box with a ceramic mug, featuring the tagline 'Morning Brew Delivered'"

Example of bad prompt:
"1. Coffee subscription 2. Ceramic mug 3. Morning Brew Delivered"

The final prompt should read naturally as ONE complete instruction, not a list of elements.`
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error("Response body is null");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        buffer += text;

        // Process complete JSON objects
        const lines = buffer.split('\n');
        buffer = lines.pop() || ""; // Keep the last incomplete line in the buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              const chunk = JSON.parse(line) as StreamingChunk;

              if (chunk.type === 'thinking') {
                // Just update the thinking state without triggering scrolls
                setThinking(prev => [...prev, chunk.value || '']);
              } else if (chunk.type === 'text-delta') {
                setGeneratedPrompt(prev => (prev || "") + (chunk.textDelta || ''));
                setIsThinking(false);
              } else if (chunk.type === 'done') {
                setIsThinking(false);
                setIsLoading(false);
              }
            } catch (e) {
              console.warn('Failed to parse JSON:', line, e);
            }
          }
        }
      }

    } catch (err: unknown) {
      console.error("Error in handleGeneratePromptAndImage:", err);
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      setError(errorMessage);
      setIsLoading(false);
      setIsThinking(false);
      if (currentStep === 4) {
        setCurrentStep(3); // Go back to website content
      }
    }
  };

  const handleGenerateImage = async () => {
    if (!generatedPrompt) return;

    setCurrentStep(5);
    setIsLoading(true);
    setError(null);

    try {
      // Combine content prompt and style prompt
      const combinedPrompt = `${generatedPrompt}\n\nSTYLE PROMPT:\n${stylePrompt}`;

      // Generate Image with the combined prompt
      setLoadingMessage(`Generating image with Imagen 4...`);

      // Prepare headers based on whether we're using env variables or user input
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      // Add the API key header if the user has provided one
      // In a real implementation, you might want to have a separate input for FAL_KEY
      // For simplicity here, we're just using the Firecrawl API key prompt
      if (firecrawlApiKey) {
        headers['X-Fal-API-Key'] = firecrawlApiKey;
      }

      const imageGenResponse = await fetch('/api/imagen4', {
        method: 'POST',
        headers,
        body: JSON.stringify({ prompt: combinedPrompt })
      });

      if (!imageGenResponse.ok) {
        const errData = await imageGenResponse.json() as ImageGenResponse;
        throw new Error(errData.error || `Image generation failed with status: ${imageGenResponse.status}`);
      }

      const imageGenData = await imageGenResponse.json() as ImageGenResponse;
      if (!imageGenData.imageBase64) {
        console.error("Imagen4 did not return image data:", imageGenData);
        throw new Error('Failed to generate image.');
      }

      setGeneratedImage(`data:${imageGenData.contentType};base64,${imageGenData.imageBase64}`);
      setIsLoading(false);
      setCurrentStep(6);

    } catch (err: unknown) {
      console.error("Error generating image:", err);
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      setError(errorMessage);
      setIsLoading(false);
      // Stay on prompt editing step
      setCurrentStep(4);
    }
  };

  useEffect(() => {
    if (thinking.length > 0) {
      thinkingRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [thinking]);

  const resetProcess = () => {
    // Clear any saved prompts in session storage
    sessionStorage.removeItem('savedPrompt');
    sessionStorage.removeItem('savedStylePrompt');

    // Clear local storage cache if any
    try {
      localStorage.removeItem('cachedPrompt');
      localStorage.removeItem('cachedStylePrompt');
    } catch (e) {
      console.warn('Could not access localStorage:', e);
    }

    setCurrentStep(1);
    setUrl("");
    setSelectedStyleId(null);
    setGeneratedImage(null);
    setIsLoading(false);
    setLoadingMessage("");
    setGeneratedPrompt("");
    setStylePrompt("");
    setWebsiteContent(null);
    setIsScrapingComplete(false);
    setError(null);
    setThinking([]);
    setIsThinking(false);
  };

  const getSelectedStyleName = () => {
    return imageStyleOptions.find(s => s.id === selectedStyleId)?.name || selectedStyleId || "selected style";
  };

  const copyMarkdownToClipboard = () => {
    if (websiteContent) {
      navigator.clipboard.writeText(websiteContent)
        .then(() => {
          toast.success("Markdown copied to clipboard!");
        })
        .catch(err => {
          toast.error("Failed to copy: " + err);
        });
    }
  };

  // Toggle prompt visibility for a style
  const togglePrompt = (styleId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the parent button click
    setExpandedPromptId(expandedPromptId === styleId ? null : styleId);
  };

  // Function to download the generated image
  const handleDownloadImage = () => {
    if (!generatedImage) return;

    // Create a link element
    const link = document.createElement('a');
    link.href = generatedImage;
    link.download = `${url.replace(/^https?:\/\//, '').replace(/[^\w]/g, '-')}-image.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('Image downloaded successfully!');
  };

  return (
    <div className="px-4 sm:container py-6 sm:py-10 max-w-3xl mx-auto font-inter">
      <div className="flex justify-between items-center mb-8">
        <Link href="https://www.firecrawl.dev/?utm_source=tool-url-to-website" target="_blank" rel="noopener noreferrer">
          <Image
            src="/firecrawl-logo-with-fire.png"
            alt="Firecrawl Logo"
            width={113}
            height={24}
          />
        </Link>
        <Button
          asChild
          variant="code"
          className="font-medium flex items-center gap-2"
        >
          <a
            href="https://github.com/mendableai/firecrawl/tree/main/examples"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            Use this template
          </a>
        </Button>
      </div>

      <div className="text-center mb-10">
        <h1 className="text-[2.5rem] lg:text-[3.8rem] text-center text-[#36322F] dark:text-zinc-100 font-semibold tracking-tight leading-[1.2] mt-4 opacity-0 animate-fade-up [animation-duration:var(--d-3)] [animation-delay:var(--t-1)]">
          Turn any Website into<br />
          <span className="block leading-[1.3] opacity-0 animate-fade-up [animation-duration:var(--d-3)] [animation-delay:var(--t-2)]">
            <span className="relative px-1 text-transparent bg-clip-text bg-gradient-to-tr from-red-600 to-yellow-500 inline-flex justify-center items-center">
              a Stunning Image
            </span>
          </span>
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto mt-4">
          Enter a website URL, choose an image style, and watch as Firecrawl
          extracts the content and transforms it into a beautiful image.
        </p>
      </div>

      {/* Show loading state while checking environment */}
      {isCheckingEnv ? (
        <div className="text-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Initializing...</p>
        </div>
      ) : (
        <>
          <UrlToImageProgressBar activeStep={currentStep} />

          {/* API Key Modal */}
          <Dialog open={showApiKeyModal} onOpenChange={setShowApiKeyModal}>
            <DialogContent className="sm:max-w-md bg-white dark:bg-zinc-900">
              <DialogHeader>
                <DialogTitle>Firecrawl API Key Required</DialogTitle>
                <DialogDescription>
                  An API key is required to use the Firecrawl service. Please get one from firecrawl.dev and enter it below.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4 py-4">
                <Button
                  onClick={openFirecrawlWebsite}
                  variant="outline"
                  className="flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ExternalLink className="h-4 w-4" />
                  Get your API key from Firecrawl
                </Button>
                <Input
                  type="password"
                  placeholder="Enter your Firecrawl API key"
                  value={firecrawlApiKey}
                  onChange={(e) => setFirecrawlApiKey(e.target.value)}
                  className="flex-grow"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Your API key will only be used for this session and will not be stored permanently.
                </p>
              </div>
              <DialogFooter>
                <Button onClick={saveApiKey} variant="orange" className="cursor-pointer">
                  Save and Continue
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="bg-[#FBFAF9] p-6 sm:p-8 rounded-lg shadow-sm ">
            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-md">
                <p className="font-semibold">Error:</p>
                <p>{error}</p>
                <Button onClick={resetProcess} variant="link" className="text-red-700 underline p-0 h-auto mt-1">Try Again</Button>
              </div>
            )}
            {currentStep === 1 && (
              <div>
                <h2 className="text-xl font-semibold mb-1">Step 1: Enter URL</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Provide the URL of the website you want to transform.
                </p>

                <div className="flex gap-2 mb-4">
                  <Input
                    type="url"
                    placeholder="firecrawl.dev"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="flex-grow [&::placeholder]:text-gray-300 dark:[&::placeholder]:text-gray-500"
                    disabled={isLoading}
                  />
                  <Button onClick={handleUrlSubmit} disabled={!url || isLoading} variant="orange">
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Next"
                    )}
                  </Button>
                </div>

                {hasApiKey && (
                  <div className="mt-4">
                    <Button
                      variant="code"
                      size="sm"
                      onClick={() => {
                        setHasApiKey(false);
                        setFirecrawlApiKey("");
                        localStorage.removeItem('firecrawl_api_key');
                      }}
                    >
                      Change API Key
                    </Button>
                  </div>
                )}
              </div>
            )}

            {currentStep === 2 && !isLoading && (
              <div>
                <h2 className="text-xl font-semibold mb-1">
                  Step 2: Select Image Style
                </h2>
                <p className="text-sm text-muted-foreground mb-6">
                  Choose a style for your generated image. Click the &quot;View Prompt&quot; button to see the style-specific prompt.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {imageStyleOptions.map((styleOption) => (
                    <div key={styleOption.id} className="space-y-2">
                      <button
                        onClick={() => handleStyleSelect(styleOption.id)}
                        className={`relative border-2 rounded-lg overflow-hidden transition-all duration-200 ease-in-out group focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 aspect-square w-full
                                    hover:translate-y-[1px] hover:scale-[0.98] 
                                    active:translate-y-[2px] active:scale-[0.97] 
                                    disabled:shadow-none disabled:hover:translate-y-0 disabled:hover:scale-100 
                                    [box-shadow:inset_0px_-2.108433723449707px_0px_0px_#171310,_0px_1.2048193216323853px_6.325301647186279px_0px_rgba(58,_33,_8,_0.25)] 
                                    hover:[box-shadow:inset_0px_-1px_0px_0px_#171310,_0px_1px_3px_0px_rgba(58,_33,_8,_0.2)] 
                                    active:[box-shadow:inset_0px_1px_1px_0px_#171310,_0px_1px_2px_0px_rgba(58,_33,_8,_0.15)] 
                                    ${selectedStyleId === styleOption.id ? "border-primary ring-2 ring-primary" : "border-card hover:border-muted-foreground/50"}`}
                      >
                        <Image
                          src={styleOption.src}
                          alt={styleOption.alt}
                          width={200}
                          height={150}
                          className="object-cover w-full h-full group-hover:opacity-80 transition-opacity"
                        />
                        {selectedStyleId === styleOption.id && (
                          <div className="absolute top-2 right-2 bg-primary rounded-full p-1 shadow-lg">
                            <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-primary-foreground" />
                          </div>
                        )}
                        <p className="text-center py-2 text-xs sm:text-sm font-medium bg-card/70 dark:bg-zinc-900/70 backdrop-blur-sm absolute bottom-0 w-full text-foreground dark:text-zinc-200 group-hover:bg-black group-hover:text-white transition-colors duration-200">
                          {styleOption.name}
                        </p>
                      </button>

                      <div className="flex gap-2 w-full">
                        <Button
                          variant="orange"
                          size="sm"
                          className="text-xs w-1/2"
                          onClick={() => handleStyleSelect(styleOption.id)}
                        >
                          Run
                        </Button>
                        <Button
                          variant="code"
                          size="sm"
                          className="text-xs w-1/2"
                          onClick={(e) => togglePrompt(styleOption.id, e)}
                        >
                          {expandedPromptId === styleOption.id ? "Hide Prompt" : "View Prompt"}
                        </Button>
                      </div>

                      {expandedPromptId === styleOption.id && (
                        <div className="bg-white dark:bg-zinc-800 p-3 rounded-md border text-xs text-gray-700 dark:text-gray-300">
                          {styleOption.prompt}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-8 flex justify-start">
                  <Button
                    variant="code"
                    size="sm"
                    onClick={() => setCurrentStep(1)}
                    className="flex items-center gap-1.5"
                  >
                    <ArrowLeft size={16} />
                    Back to URL Input
                  </Button>
                </div>
              </div>
            )}

            {currentStep === 3 && isLoading && !isScrapingComplete && (
              <div className="text-center py-10">
                <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
                <p className="text-lg font-semibold text-muted-foreground">{loadingMessage}</p>
              </div>
            )}

            {currentStep === 3 && isScrapingComplete && websiteContent && (
              <div>
                <h2 className="text-xl font-semibold mb-1">
                  Step 3: Website Content
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Firecrawl has extracted the following content from {url}
                </p>
                <div className="bg-white dark:bg-zinc-800 border rounded-md mb-6">
                  <div className="flex justify-between items-center p-3 border-b">
                    <h3 className="text-sm font-semibold">Markdown Content</h3>
                    <Button
                      variant="code"
                      size="sm"
                      onClick={copyMarkdownToClipboard}
                      className="flex items-center gap-1"
                    >
                      <ClipboardCopy className="h-3 w-3" />
                      Copy
                    </Button>
                  </div>
                  <div className="p-4 h-60 overflow-y-auto">
                    <pre className="text-xs whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                      {websiteContent}
                    </pre>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <Button
                    variant="code"
                    size="sm"
                    onClick={() => setCurrentStep(2)}
                    className="flex items-center gap-1.5"
                  >
                    <ArrowLeft size={16} />
                    Back to Styles
                  </Button>
                  <Button
                    onClick={handleGeneratePromptAndImage}
                    variant="orange"
                  >
                    Generate Prompt
                  </Button>
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="h-auto">
                <h2 className="text-xl font-semibold mb-1">
                  Step 4: Generate & Edit Prompt
                </h2>

                {/* Fixed height thinking steps with no auto-scroll */}
                {thinking.length > 0 && (
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-base font-semibold">Thinking Steps:</h3>
                      {isThinking && (
                        <div className="flex items-center text-sm text-gray-500">
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Thinking...
                        </div>
                      )}
                    </div>
                    <div className="bg-gray-100 dark:bg-zinc-800 p-4 rounded-md h-[150px] overflow-y-auto">
                      {thinking.map((thought, index) => (
                        <div key={index} className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                          {thought}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Side by side Content and Style Prompts */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {/* Content prompt with fixed height */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <h3 className="text-base font-semibold">Content Prompt:</h3>
                      {isLoading && !thinking.length && (
                        <div className="flex items-center text-sm text-gray-500">
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Generating...
                        </div>
                      )}
                    </div>
                    <Textarea
                      placeholder="Content prompt will appear here..."
                      className="w-full"
                      style={{ height: '150px' }}
                      value={generatedPrompt || ""}
                      onChange={(e) => setGeneratedPrompt(e.target.value)}
                      disabled={isLoading}
                    />
                  </div>

                  {/* Style Prompt Section with fixed height */}
                  <div className="space-y-2">
                    <h3 className="text-base font-semibold">Style Prompt:</h3>
                    <Textarea
                      placeholder="Style prompt will appear here..."
                      className="w-full text-sm"
                      style={{ height: '150px' }}
                      value={stylePrompt}
                      onChange={(e) => setStylePrompt(e.target.value)}
                      disabled={isLoading}
                    />
                  </div>
                </div>

                {/* Preview of combined prompt with fixed height */}
                <div className="mb-6 p-3 bg-gray-100 dark:bg-zinc-900 rounded-md border border-gray-200 dark:border-zinc-800">
                  <h3 className="text-sm font-semibold mb-2">Final Image Prompt Preview:</h3>
                  <div className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap h-[100px] overflow-y-auto">
                    {generatedPrompt || "Content prompt will appear here..."}
                    {stylePrompt && "\n\nSTYLE PROMPT:\n"}
                    {stylePrompt || "Style prompt will appear here..."}
                  </div>
                </div>

                <div className="flex justify-between items-center mt-6">
                  <Button
                    variant="code"
                    size="sm"
                    onClick={() => {
                      // Store the current prompt state in sessionStorage before navigating back
                      if (generatedPrompt) {
                        sessionStorage.setItem('savedPrompt', generatedPrompt);
                        sessionStorage.setItem('savedStylePrompt', stylePrompt);
                      }
                      setCurrentStep(3);
                    }}
                    className="flex items-center gap-1.5"
                    disabled={isLoading}
                  >
                    <ArrowLeft size={16} />
                    Back to Website Content
                  </Button>

                  <Button
                    onClick={handleGenerateImage}
                    variant="orange"
                    disabled={isLoading || !generatedPrompt}
                  >
                    {isLoading ? (
                      <span className="flex items-center">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </span>
                    ) : "Generate Image"}
                  </Button>
                </div>
              </div>
            )}

            {(currentStep === 5) && isLoading && (
              <div className="text-center py-10">
                <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
                <p className="text-lg font-semibold text-muted-foreground">{loadingMessage}</p>
              </div>
            )}

            {currentStep === 6 && generatedImage && !isLoading && (
              <div>
                <h2 className="text-xl font-semibold mb-1">
                  Step 6: View Your Image!
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Here&apos;s the image generated from <span className="font-medium">{url}</span> in the style of {getSelectedStyleName() || "your chosen style"}.
                </p>
                <div className="relative group aspect-[4/3] sm:aspect-video rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 mb-4">
                  <Image
                    src={generatedImage}
                    alt={`Generated image for ${url} in ${getSelectedStyleName()} style`}
                    fill
                    className="object-contain animate-scale-in-content [animation-duration:var(--d-3)] [animation-delay:var(--t-2)]"
                    style={{ animationFillMode: 'forwards' }}
                    priority
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  />
                </div>
                <div className="opacity-0 animate-fade-up [animation-duration:var(--d-3)] [animation-delay:var(--t-3)]" style={{ animationFillMode: 'forwards' }}>
                  <div className="flex flex-col sm:flex-row gap-3 w-full">
                    <Button
                      onClick={handleGenerateImage}
                      variant="code"
                      className="flex-1 flex items-center justify-center gap-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-refresh-cw">
                        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                        <path d="M21 3v5h-5" />
                        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                        <path d="M3 21v-5h5" />
                      </svg>
                      Regenerate
                    </Button>
                    <Button
                      onClick={handleDownloadImage}
                      variant="orange"
                      className="flex-1 flex items-center justify-center gap-2"
                    >
                      <Download size={18} />
                      Download Image
                    </Button>
                  </div>
                </div>

                {/* Prompt Display */}
                <div className="mt-8 p-4 bg-gray-100 dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 opacity-0 animate-fade-up [animation-duration:var(--d-3)] [animation-delay:var(--t-3)]" style={{ animationFillMode: 'forwards' }}>
                  <h3 className="text-base font-semibold mb-2">Image Generated With This Prompt:</h3>
                  <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {generatedPrompt}
                    {stylePrompt && generatedPrompt && "\n\nSTYLE PROMPT:\n"}
                    {stylePrompt}
                  </div>
                </div>

                <div className="mt-8 flex justify-center items-center opacity-0 animate-fade-up [animation-duration:var(--d-3)] [animation-delay:var(--t-4)]" style={{ animationFillMode: 'forwards' }}>
                  <Button onClick={resetProcess} variant="orange" className="text-sm">
                    Start Over
                  </Button>
                </div>
              </div>
            )}
          </div>

          <footer className="mt-12 text-center text-sm text-muted-foreground">
            <p>
              Powered by{" "}
              <Link href="https://www.firecrawl.dev" target="_blank" rel="noopener noreferrer" className="font-medium hover:underline text-orange-500">
                Firecrawl{" "}
              </Link>
              {" "}|{" "}
              <Link href="https://aistudio.google.com/prompts/new_chat" target="_blank" rel="noopener noreferrer" className="font-medium hover:underline text-orange-500">
                Gemini 2.5 Flash
              </Link>
              {" "}|{" "}
              <Link href="https://fal.ai/models/fal-ai/imagen4/preview" target="_blank" rel="noopener noreferrer" className="font-medium hover:underline text-orange-500">
                Imagen 4
              </Link>
            </p>
          </footer>
        </>
      )}
    </div>
  );
}