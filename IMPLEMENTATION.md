# Implementation of OpenAI-Compatible Provider Support

## Summary

This implementation restores support for OpenAI-compatible providers in Firecrawl using the existing `OPENAI_BASE_URL` and `OPENAI_API_KEY` environment variables.

## Changes Made

1. Updated the OpenAI provider configuration in `apps/api/src/lib/generic-ai.ts` to use `createOpenAI()` with a custom base URL when `OPENAI_BASE_URL` is set:

```typescript
// Configure OpenAI provider with custom base URL if provided
// This allows using OpenAI-compatible providers by setting the OPENAI_BASE_URL environment variable
// The provider will use the standard OPENAI_API_KEY for authentication
const configuredOpenAI = process.env.OPENAI_BASE_URL
  ? createOpenAI({
      baseURL: process.env.OPENAI_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY || '',
    })
  : openai;

const providerList: Record<Provider, any> = {
  openai: configuredOpenAI, //OPENAI_API_KEY with optional OPENAI_BASE_URL
  // other providers...
};
```

## How It Works

1. When `OPENAI_BASE_URL` is set in the environment:
   - The code uses `createOpenAI()` to create a custom OpenAI provider that points to the specified base URL.
   - The custom provider uses the `OPENAI_API_KEY` for authentication.
   - This configuration is used for both regular models and embedding models.

2. When `OPENAI_BASE_URL` is not set:
   - The code uses the default OpenAI provider imported directly from `@ai-sdk/openai`.

3. The provider is stored in the `providerList` as the "openai" provider, ensuring backward compatibility with existing code that uses the OpenAI provider.

## Testing

The implementation was manually tested to ensure:
1. The code compiles correctly with TypeScript.
2. The changes match the API patterns used in the `@ai-sdk/openai` package.
3. The implementation is backward compatible with the existing codebase.

## Usage

To use an OpenAI-compatible provider:

1. Set the `OPENAI_BASE_URL` environment variable to the base URL of the OpenAI-compatible API (e.g., `https://api.example.com/v1`).
2. Set the `OPENAI_API_KEY` environment variable to your API key for the OpenAI-compatible provider.

No additional configuration is required.