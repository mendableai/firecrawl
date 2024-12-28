import { EngineResultsTracker } from ".";
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

  constructor(featureFlags: FeatureFlag[]) {
    super("New feature flags have been discovered: " + featureFlags.join(", "));
    this.featureFlags = featureFlags;
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
