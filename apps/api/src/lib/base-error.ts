/**
 * Base error class that automatically generates error codes from class names
 */
export class BaseError extends Error {
  public code: string;

  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.code = this.generateErrorCode();
  }

  /**
   * Generates an error code from the class name
   * e.g., "TimeoutError" -> "TIMEOUT_ERROR"
   * e.g., "SSLError" -> "SSL_ERROR"
   */
  private generateErrorCode(): string {
    const className = this.constructor.name;
    
    // Special case for base Error class
    if (className === 'Error' || className === 'BaseError') {
      return 'UNKNOWN_ERROR';
    }

    // Convert PascalCase to SCREAMING_SNAKE_CASE
    const code = className
      .replace(/Error$/, '') // Remove "Error" suffix if present
      .replace(/([A-Z])/g, '_$1') // Add underscore before capital letters
      .toUpperCase()
      .replace(/^_/, ''); // Remove leading underscore

    return code + '_ERROR';
  }

  /**
   * Creates a serializable error object for BullMQ
   */
  public toSerializable(): SerializedError {
    return {
      name: this.constructor.name,
      message: this.message,
      code: this.code,
      stack: this.stack,
    };
  }

  /**
   * Reconstructs an error from serialized data
   */
  public static fromSerializable(data: SerializedError): BaseError {
    const error = new BaseError(data.message);
    error.name = data.name;
    error.code = data.code;
    error.stack = data.stack;
    return error;
  }
}

export interface SerializedError {
  name: string;
  message: string;
  code: string;
  stack?: string;
}

/**
 * Helper function to serialize any error (including non-BaseError instances)
 */
export function serializeError(error: Error | BaseError): SerializedError {
  if (error instanceof BaseError) {
    return error.toSerializable();
  }

  // For regular errors, generate a code from the error name or use a default
  let code = 'UNKNOWN_ERROR';
  
  if (error.name && error.name !== 'Error') {
    code = error.name
      .replace(/Error$/, '')
      .replace(/([A-Z])/g, '_$1')
      .toUpperCase()
      .replace(/^_/, '') + '_ERROR';
  } else if (error.message) {
    // Try to infer error type from message
    const message = error.message.toLowerCase();
    if (message.includes('timeout')) {
      code = 'TIMEOUT_ERROR';
    } else if (message.includes('ssl') || message.includes('certificate')) {
      code = 'SSL_ERROR';
    } else if (message.includes('dns')) {
      code = 'DNS_RESOLUTION_ERROR';
    } else if (message.includes('network')) {
      code = 'NETWORK_ERROR';
    } else if (message.includes('auth') || message.includes('forbidden')) {
      code = 'AUTHORIZATION_ERROR';
    } else if (message.includes('invalid') || message.includes('validation')) {
      code = 'VALIDATION_ERROR';
    }
  }

  return {
    name: error.name || 'Error',
    message: error.message,
    code,
    stack: error.stack,
  };
}

/**
 * Helper function to get error code from any error
 */
export function getErrorCode(error: Error | BaseError | { code?: string }): string {
  if ('code' in error && typeof error.code === 'string') {
    return error.code;
  }
  
  const serialized = serializeError(error as Error);
  return serialized.code;
}