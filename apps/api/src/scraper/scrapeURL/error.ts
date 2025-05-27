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
  constructor() {
    super("An SSL error occurred while scraping the URL. If you're not inputting any sensitive data, try scraping with `skipTlsVerification: true`.");
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
