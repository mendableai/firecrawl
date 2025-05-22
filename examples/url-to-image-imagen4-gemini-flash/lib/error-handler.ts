import { v4 as uuidv4 } from 'uuid';
import { NextResponse } from 'next/server';

// Define error types for consistent user-facing messages
export enum ErrorType {
  VALIDATION = 'VALIDATION',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  RATE_LIMIT = 'RATE_LIMIT',
  NOT_FOUND = 'NOT_FOUND',
  API_ERROR = 'API_ERROR',
  SERVER_ERROR = 'SERVER_ERROR'
}

// Map error types to appropriate HTTP status codes
const errorStatusCodes: Record<ErrorType, number> = {
  [ErrorType.VALIDATION]: 400,
  [ErrorType.AUTHENTICATION]: 401,
  [ErrorType.AUTHORIZATION]: 403,
  [ErrorType.RATE_LIMIT]: 429,
  [ErrorType.NOT_FOUND]: 404,
  [ErrorType.API_ERROR]: 502,
  [ErrorType.SERVER_ERROR]: 500
};

// Map error types to user-friendly messages
const errorMessages: Record<ErrorType, string> = {
  [ErrorType.VALIDATION]: 'Invalid request data. Please check your input and try again.',
  [ErrorType.AUTHENTICATION]: 'Authentication required. Please provide valid credentials.',
  [ErrorType.AUTHORIZATION]: 'You do not have permission to perform this action.',
  [ErrorType.RATE_LIMIT]: 'Rate limit exceeded. Please try again later.',
  [ErrorType.NOT_FOUND]: 'The requested resource was not found.',
  [ErrorType.API_ERROR]: 'Error communicating with external service. Please try again later.',
  [ErrorType.SERVER_ERROR]: 'An unexpected error occurred. Please try again later.'
};

// Helper function to handle errors in a consistent way
export function handleError(
  error: unknown, 
  errorType: ErrorType = ErrorType.SERVER_ERROR, 
  context: string = 'API',
  additionalInfo: Record<string, unknown> = {}
) {
  // Generate a correlation ID for tracing
  const correlationId = uuidv4();
  
  // Get error message if available
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Build the log object with all relevant information
  const logData = {
    timestamp: new Date().toISOString(),
    correlationId,
    context,
    errorType,
    errorMessage,
    stack: error instanceof Error ? error.stack : undefined,
    ...additionalInfo
  };
  
  // Log the full error details for debugging
  if (process.env.NODE_ENV === 'production') {
    // In production, use structured logging
    console.error(JSON.stringify(logData));
  } else {
    // In development, make it more readable
    console.error(`[${logData.context}] Error (${correlationId}):`, error);
    console.error('Additional info:', additionalInfo);
  }
  
  // Return a sanitized error response for the client
  return {
    status: errorStatusCodes[errorType],
    body: {
      error: {
        message: errorMessages[errorType],
        correlationId,
        type: errorType
      }
    }
  };
}

// Helper function specifically for Next.js API routes returning NextResponse
export function handleNextError(
  error: unknown, 
  errorType: ErrorType = ErrorType.SERVER_ERROR, 
  context: string = 'API',
  additionalInfo: Record<string, unknown> = {}
) {
  const { status, body } = handleError(error, errorType, context, additionalInfo);
  return NextResponse.json(body, { status });
}

// Helper function specifically for Edge Runtime API routes
export function handleEdgeError(
  error: unknown, 
  errorType: ErrorType = ErrorType.SERVER_ERROR, 
  context: string = 'API',
  additionalInfo: Record<string, unknown> = {}
) {
  const { status, body } = handleError(error, errorType, context, additionalInfo);
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });
} 