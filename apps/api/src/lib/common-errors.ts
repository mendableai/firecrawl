import { BaseError } from "./base-error";

/**
 * Common error classes used across the application
 */

export class InvalidUrlError extends BaseError {
  constructor(url?: string) {
    super(url ? `Invalid URL: ${url}` : "Invalid URL");
  }
}

export class InsufficientCreditsError extends BaseError {
  constructor(message?: string) {
    super(message || "Insufficient credits");
  }
}

export class RateLimitError extends BaseError {
  constructor(message?: string) {
    super(message || "Rate limit exceeded");
  }
}

export class NotFoundError extends BaseError {
  constructor(resource?: string) {
    super(resource ? `${resource} not found` : "Resource not found");
  }
}

export class ForbiddenError extends BaseError {
  constructor(message?: string) {
    super(message || "Forbidden");
  }
}

export class UnauthorizedError extends BaseError {
  constructor(message?: string) {
    super(message || "Unauthorized");
  }
}

export class ValidationError extends BaseError {
  constructor(message: string) {
    super(message);
  }
}

export class JobExpiredError extends BaseError {
  constructor() {
    super("Job expired");
  }
}

export class JobNotFoundError extends BaseError {
  constructor() {
    super("Job not found");
  }
}

export class InvalidRequestError extends BaseError {
  constructor(message: string) {
    super(message);
  }
}

export class NetworkError extends BaseError {
  constructor(message?: string) {
    super(message || "Network error");
  }
}

export class UnknownError extends BaseError {
  constructor(message?: string) {
    super(message || "Unknown error");
  }
}