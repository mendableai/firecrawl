import { BaseError, SerializedError, serializeError, getErrorCode } from "./base-error";

/**
 * Stores error metadata in job data before failing the job
 * This preserves error code and other metadata through BullMQ serialization
 */
export async function storeErrorMetadata(job: any, error: Error | BaseError): Promise<void> {
  const serialized = serializeError(error);
  
  // Store error metadata in job data so it persists through BullMQ
  await job.update({
    ...job.data,
    __errorMetadata: serialized,
  });
}

/**
 * Retrieves error metadata from a failed job
 * Returns the error code and other preserved metadata
 */
export function getErrorMetadata(job: any): SerializedError | null {
  return job.data?.__errorMetadata || null;
}

/**
 * Gets the error code from a job's failed reason or stored metadata
 */
export function getJobErrorCode(job: any): string {
  // First check if we have stored metadata
  const metadata = getErrorMetadata(job);
  if (metadata?.code) {
    return metadata.code;
  }

  // Fallback to parsing the failedReason string
  const failedReason = job.failedReason;
  if (!failedReason) {
    return "UNKNOWN_ERROR";
  }

  // Try to infer error type from the failed reason message
  const reason = failedReason.toLowerCase();
  
  if (reason.includes("ssl") || reason.includes("certificate")) {
    return "SSL_ERROR";
  } else if (reason.includes("timeout")) {
    return "TIMEOUT_ERROR";
  } else if (reason.includes("dns")) {
    return "DNS_RESOLUTION_ERROR";
  } else if (reason.includes("network")) {
    return "NETWORK_ERROR";
  } else if (reason.includes("auth") || reason.includes("forbidden")) {
    return "AUTHORIZATION_ERROR";
  } else if (reason.includes("validation") || reason.includes("invalid")) {
    return "VALIDATION_ERROR";
  } else if (reason.includes("insufficient credits")) {
    return "INSUFFICIENT_CREDITS_ERROR";
  } else if (reason.includes("rate limit")) {
    return "RATE_LIMIT_ERROR";
  } else if (reason.includes("zdr violation") || reason.includes("zero data retention")) {
    return "ZDR_VIOLATION_ERROR";
  } else if (reason.includes("unsupported file")) {
    return "UNSUPPORTED_FILE_ERROR";
  } else if (reason.includes("pdf") && reason.includes("antibot")) {
    return "PDFANTIBOT_ERROR";
  } else if (reason.includes("no engines left")) {
    return "NO_ENGINES_LEFT_ERROR";
  } else if (reason.includes("site error")) {
    return "SITE_ERROR";
  } else if (reason.includes("cost limit")) {
    return "COST_LIMIT_EXCEEDED_ERROR";
  } else if (reason.includes("llm refusal")) {
    return "LLMREFUSAL_ERROR";
  }

  return "UNKNOWN_ERROR";
}

/**
 * Creates an error response with proper error code
 */
export function createErrorResponse(error: Error | BaseError | string, statusCode?: number): {
  success: false;
  error: string;
  code: string;
  details?: any;
} {
  let errorMessage: string;
  let errorCode: string;
  let details: any = undefined;

  if (typeof error === "string") {
    errorMessage = error;
    errorCode = "UNKNOWN_ERROR";
  } else if (error instanceof BaseError) {
    errorMessage = error.message;
    errorCode = error.code;
    
    // Include additional error properties as details
    const serialized = error.toSerializable();
    if (Object.keys(serialized).length > 3) { // More than name, message, code
      details = serialized;
    }
  } else if (error instanceof Error) {
    errorMessage = error.message;
    errorCode = getErrorCode(error);
  } else {
    errorMessage = "Unknown error";
    errorCode = "UNKNOWN_ERROR";
  }

  return {
    success: false,
    error: errorMessage,
    code: errorCode,
    details,
  };
}