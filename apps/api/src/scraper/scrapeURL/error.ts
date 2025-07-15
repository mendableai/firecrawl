import { EngineResultsTracker, Meta } from ".";
import { Engine, FeatureFlag } from "./engines";

export class EngineError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class TimeoutError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class NoEnginesLeftError extends Error {
  public fallbackList: Engine[];
  public results: EngineResultsTracker;

  constructor(fallbackList: Engine[], results: EngineResultsTracker) {
    super(
      "All scraping engines failed! -- Double check the URL to make sure it's not broken. If the issue persists, contact us at help@firecrawl.com.",
    );
    this.fallbackList = fallbackList;
    this.results = results;
  }
}

export class AddFeatureError extends Error {
  public featureFlags: FeatureFlag[];
  public pdfPrefetch: Meta["pdfPrefetch"];

  constructor(featureFlags: FeatureFlag[], pdfPrefetch?: Meta["pdfPrefetch"]) {
    super("New feature flags have been discovered: " + featureFlags.join(", "));
    this.featureFlags = featureFlags;
    this.pdfPrefetch = pdfPrefetch;
  }
}

export class RemoveFeatureError extends Error {
  public featureFlags: FeatureFlag[];

  constructor(featureFlags: FeatureFlag[]) {
    super(
      "Incorrect feature flags have been discovered: " +
        featureFlags.join(", "),
    );
    this.featureFlags = featureFlags;
  }
}

export class SSLError extends Error {
  constructor(skipTlsVerification: boolean) {
    super(
      "An SSL error occurred while scraping the URL. "
      + (skipTlsVerification
        ? "Since you have `skipTlsVerification` enabled, this means that the TLS configuration of the target site is completely broken. Try scraping the plain HTTP version of the page."
        : "If you're not inputting any sensitive data, try scraping with `skipTlsVerification: true`.")
    );
  }
}

export class SiteError extends Error {
  public code: string;
  constructor(code: string) {
    super(
      "Specified URL is failing to load in the browser. Error code: " + code,
    );
    this.code = code;
  }
}

export class ActionError extends Error {
  public code: string;
  constructor(code: string) {
    super("Action(s) failed to complete. Error code: " + code);
    this.code = code;
  }
}

export class UnsupportedFileError extends Error {
  public reason: string;
  constructor(reason: string) {
    super("Scrape resulted in unsupported file: " + reason);
    this.reason = reason;
  }
}

export class PDFAntibotError extends Error {
  constructor() {
    super("PDF scrape was prevented by anti-bot")
  }
}

export class PDFInsufficientTimeError extends Error {
  constructor(pageCount: number, minTimeout: number) {
    super(`Insufficient time to process PDF of ${pageCount} pages. Please increase the timeout parameter in your scrape request to at least ${minTimeout}ms.`);
  }
}

export class DNSResolutionError extends Error {
  constructor(hostname: string) {
    super(`DNS resolution failed for hostname: ${hostname}. Please check if the domain is valid and accessible.`);
  }
}

export class IndexMissError extends Error {
  constructor() {
    super("Index doesn't have the page we're looking for");
  }
}

export class ZDRViolationError extends Error {
  constructor(feature: string) {
    super(`${feature} is not supported when using zeroDataRetention. Please contact support@firecrawl.com to unblock this feature.`);
  }
}

export class PDFPrefetchFailed extends Error {
  constructor() {
    super("Failed to prefetch PDF that is protected by anti-bot. Please contact help@firecrawl.com");
  }
}

export class FEPageLoadFailed extends Error {
  constructor() {
    super("The page failed to load with the specified timeout. Please increase the timeout parameter in your request.");
  }
}
