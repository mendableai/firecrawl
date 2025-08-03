import { Response } from "express";
import { ErrorResponse } from "./v1/types";
import { BaseError } from "../lib/base-error";
import { createErrorResponse } from "../lib/error-serialization";
import { CustomError } from "../lib/custom-error";
import { z } from "zod";

/**
 * Common error response handler for all controllers
 * Ensures all error responses include proper error codes
 */
export function sendErrorResponse(
  res: Response<ErrorResponse>,
  error: unknown,
  defaultStatusCode: number = 500,
  additionalFields?: Record<string, any>
): Response<ErrorResponse> {
  // Handle Zod validation errors
  if (error instanceof z.ZodError) {
    const errorResponse = createErrorResponse(
      `Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
      400
    );
    return res.status(400).json({
      ...errorResponse,
      code: "VALIDATION_ERROR",
      ...additionalFields,
    });
  }

  // Handle CustomError with status codes
  if (error instanceof CustomError) {
    const errorResponse = createErrorResponse(error, error.statusCode);
    return res.status(error.statusCode).json({
      ...errorResponse,
      ...additionalFields,
    });
  }

  // Handle BaseError with automatic code generation
  if (error instanceof BaseError) {
    const errorResponse = createErrorResponse(error, defaultStatusCode);
    return res.status(defaultStatusCode).json({
      ...errorResponse,
      ...additionalFields,
    });
  }

  // Handle regular Error objects
  if (error instanceof Error) {
    const errorResponse = createErrorResponse(error, defaultStatusCode);
    
    // Try to determine appropriate status code from error message
    let statusCode = defaultStatusCode;
    const message = error.message.toLowerCase();
    
    if (message.includes("not found")) {
      statusCode = 404;
    } else if (message.includes("unauthorized") || message.includes("forbidden")) {
      statusCode = 403;
    } else if (message.includes("invalid") || message.includes("validation")) {
      statusCode = 400;
    } else if (message.includes("timeout")) {
      statusCode = 408;
    } else if (message.includes("insufficient credits")) {
      statusCode = 402;
    }
    
    return res.status(statusCode).json({
      ...errorResponse,
      ...additionalFields,
    });
  }

  // Handle string errors
  if (typeof error === "string") {
    const errorResponse = createErrorResponse(error, defaultStatusCode);
    return res.status(defaultStatusCode).json({
      ...errorResponse,
      ...additionalFields,
    });
  }

  // Handle unknown errors
  const errorResponse = createErrorResponse(
    "An unknown error occurred",
    defaultStatusCode
  );
  return res.status(defaultStatusCode).json({
    ...errorResponse,
    ...additionalFields,
  });
}

/**
 * Error handler for specific error types with custom status codes
 */
export function handleSpecificError(
  res: Response<ErrorResponse>,
  error: unknown,
  errorTypeMap: Record<string, { statusCode: number; code: string }>
): Response<ErrorResponse> | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const message = error.message.toLowerCase();
  
  for (const [pattern, config] of Object.entries(errorTypeMap)) {
    if (message.includes(pattern.toLowerCase())) {
      return res.status(config.statusCode).json({
        success: false,
        error: error.message,
        code: config.code,
      });
    }
  }

  return null;
}

/**
 * Common error type mappings
 */
export const COMMON_ERROR_MAPPINGS = {
  "not found": { statusCode: 404, code: "NOT_FOUND_ERROR" },
  "forbidden": { statusCode: 403, code: "FORBIDDEN_ERROR" },
  "unauthorized": { statusCode: 401, code: "UNAUTHORIZED_ERROR" },
  "job expired": { statusCode: 404, code: "JOB_EXPIRED_ERROR" },
  "insufficient credits": { statusCode: 402, code: "INSUFFICIENT_CREDITS_ERROR" },
  "rate limit": { statusCode: 429, code: "RATE_LIMIT_ERROR" },
  "timeout": { statusCode: 408, code: "TIMEOUT_ERROR" },
  "validation": { statusCode: 400, code: "VALIDATION_ERROR" },
  "invalid": { statusCode: 400, code: "INVALID_REQUEST_ERROR" },
};