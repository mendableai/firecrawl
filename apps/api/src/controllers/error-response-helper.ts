/**
 * Temporary helper to add code field to error responses while migrating the codebase
 * This ensures backward compatibility while we update all error handling
 */
export function createErrorResponse(error: string, code?: string): { success: false; error: string; code: string } {
  // Try to infer code from error message if not provided
  if (!code) {
    const errorLower = error.toLowerCase();
    
    if (errorLower.includes("validation") || errorLower.includes("invalid")) {
      code = "VALIDATION_ERROR";
    } else if (errorLower.includes("not found")) {
      code = "NOT_FOUND_ERROR";
    } else if (errorLower.includes("forbidden")) {
      code = "FORBIDDEN_ERROR";
    } else if (errorLower.includes("unauthorized")) {
      code = "UNAUTHORIZED_ERROR";
    } else if (errorLower.includes("timeout")) {
      code = "TIMEOUT_ERROR";
    } else if (errorLower.includes("rate limit")) {
      code = "RATE_LIMIT_ERROR";
    } else if (errorLower.includes("insufficient credits")) {
      code = "INSUFFICIENT_CREDITS_ERROR";
    } else if (errorLower.includes("expired")) {
      code = "JOB_EXPIRED_ERROR";
    } else {
      code = "UNKNOWN_ERROR";
    }
  }

  return {
    success: false,
    error,
    code,
  };
}