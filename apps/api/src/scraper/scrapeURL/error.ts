import { EngineResultsTracker, Meta } from ".";
import { Engine, FeatureFlag } from "./engines";
import { BaseError } from "../../lib/base-error";

export class EngineError extends BaseError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class TimeoutError extends BaseError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class NoEnginesLeftError extends BaseError {
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

export class AddFeatureError extends BaseError {
  public featureFlags: FeatureFlag[];
  public pdfPrefetch: Meta["pdfPrefetch"];

  constructor(featureFlags: FeatureFlag[], pdfPrefetch?: Meta["pdfPrefetch"]) {
    super("New feature flags have been discovered: " + featureFlags.join(", "));
    this.featureFlags = featureFlags;
    this.pdfPrefetch = pdfPrefetch;
  }
}

export class RemoveFeatureError extends BaseError {
  public featureFlags: FeatureFlag[];

  constructor(featureFlags: FeatureFlag[]) {
    super(
      "Incorrect feature flags have been discovered: " +
        featureFlags.join(", "),
    );
    this.featureFlags = featureFlags;
  }
}

export class SSLError extends BaseError {
  constructor(skipTlsVerification: boolean) {
    super(
      "An SSL error occurred while scraping the URL. "
      + (skipTlsVerification
        ? "Since you have `skipTlsVerification` enabled, this means that the TLS configuration of the target site is completely broken. Try scraping the plain HTTP version of the page."
        : "If you're not inputting any sensitive data, try scraping with `skipTlsVerification: true`.")
    );
  }
}

export class SiteError extends BaseError {
  public browserCode: string;
  constructor(browserCode: string) {
    super(
      "Specified URL is failing to load in the browser. Error code: " + browserCode,
    );
    this.browserCode = browserCode;
  }
}

export class ActionError extends BaseError {
  public actionCode: string;
  constructor(actionCode: string) {
    super("Action(s) failed to complete. Error code: " + actionCode);
    this.actionCode = actionCode;
  }
}

export class UnsupportedFileError extends BaseError {
  public reason: string;
  constructor(reason: string) {
    super("Scrape resulted in unsupported file: " + reason);
    this.reason = reason;
  }
}

export class PDFAntibotError extends BaseError {
  constructor() {
    super("PDF scrape was prevented by anti-bot")
  }
}

export class PDFInsufficientTimeError extends BaseError {
  constructor(pageCount: number, minTimeout: number) {
    super(`Insufficient time to process PDF of ${pageCount} pages. Please increase the timeout parameter in your scrape request to at least ${minTimeout}ms.`);
  }
}

export class DNSResolutionError extends BaseError {
  constructor(hostname: string) {
    super(`DNS resolution failed for hostname: ${hostname}. Please check if the domain is valid and accessible.`);
  }
}

export class IndexMissError extends BaseError {
  constructor() {
    super("Index doesn't have the page we're looking for");
  }
}

export class ZDRViolationError extends BaseError {
  constructor(feature: string) {
    super(`${feature} is not supported when using zeroDataRetention. Please contact support@firecrawl.com to unblock this feature.`);
  }
}

export class PDFPrefetchFailed extends BaseError {
  constructor() {
    super("Failed to prefetch PDF that is protected by anti-bot. Please contact help@firecrawl.com");
  }
}

export class FEPageLoadFailed extends BaseError {
  constructor() {
    super("The page failed to load with the specified timeout. Please increase the timeout parameter in your request.");
  }
}
