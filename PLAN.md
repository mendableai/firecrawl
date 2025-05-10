# Plan for OpenAI-Compatible Provider Implementation

This document outlines the plan for restoring support for OpenAI-compatible providers in Firecrawl after the migration to `@ai-sdk/openai`.

## Background

Firecrawl previously supported OpenAI-compatible providers through environment variables:
- `OPENAI_API_KEY` - The API key for OpenAI or compatible provider
- `OPENAI_BASE_URL` - The base URL for OpenAI-compatible APIs (e.g., https://example.com/v1)

After migration to `@ai-sdk/openai`, this functionality needs to be restored while maintaining backward compatibility.

## Current Implementation

The current implementation in `apps/api/src/lib/generic-ai.ts` imports the OpenAI provider directly:

```typescript
import { openai } from "@ai-sdk/openai";

// ...

const providerList: Record<Provider, any> = {
  openai, //OPENAI_API_KEY
  // other providers...
};
```

## Implementation Plan

### 1. Update the OpenAI Provider Configuration

Modify the `generic-ai.ts` file to properly configure the OpenAI provider with custom base URLs when provided:

```typescript
// Import the OpenAI provider factory instead of the direct provider
import { openai } from "@ai-sdk/openai";

// ...

// Create a properly configured OpenAI provider based on environment variables
const configuredOpenAI = process.env.OPENAI_BASE_URL 
  ? openai.custom({
      baseURL: process.env.OPENAI_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY || '',
    })
  : openai;

const providerList: Record<Provider, any> = {
  openai: configuredOpenAI,
  // other providers remain unchanged...
};
```

### 2. Testing Plan

1. Test with default OpenAI configuration (only `OPENAI_API_KEY` set)
2. Test with custom base URL (`OPENAI_API_KEY` and `OPENAI_BASE_URL` set)
3. Verify no regressions in other provider configurations

### 3. Verification

Ensure backward compatibility with existing environment variable patterns by:
- Testing with different OpenAI-compatible APIs
- Confirming that all API endpoints work correctly with custom providers

## Implementation Steps

1. Update the `generic-ai.ts` file to properly handle the `OPENAI_BASE_URL` environment variable
2. Run tests to verify functionality and backward compatibility
3. Deploy and monitor for any issues