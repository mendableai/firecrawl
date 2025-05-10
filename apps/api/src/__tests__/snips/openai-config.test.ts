import { getModel } from "../../lib/generic-ai";

describe("OpenAI configuration", () => {
  // Store original environment variables
  const originalOpenAIBaseURL = process.env.OPENAI_BASE_URL;
  const originalOpenAIAPIKey = process.env.OPENAI_API_KEY;

  // After each test, restore original environment variables
  afterEach(() => {
    process.env.OPENAI_BASE_URL = originalOpenAIBaseURL;
    process.env.OPENAI_API_KEY = originalOpenAIAPIKey;
  });

  it("configures OpenAI correctly with custom base URL", () => {
    // This test only checks that it doesn't throw an error
    // We can't test actual API calls without mocking the OpenAI client
    process.env.OPENAI_BASE_URL = "https://custom-openai-provider.example.com/v1";
    process.env.OPENAI_API_KEY = "test-api-key";
    
    // This should use the custom configuration
    const model = getModel("gpt-3.5-turbo", "openai");
    expect(model).toBeDefined();
  });

  it("configures OpenAI normally without custom base URL", () => {
    // This test only checks that it doesn't throw an error
    // We can't test actual API calls without mocking the OpenAI client
    process.env.OPENAI_BASE_URL = "";
    process.env.OPENAI_API_KEY = "test-api-key";
    
    // This should use the default configuration
    const model = getModel("gpt-3.5-turbo", "openai");
    expect(model).toBeDefined();
  });
});