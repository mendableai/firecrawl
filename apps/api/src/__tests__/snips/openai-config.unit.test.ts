// Import modules first
import { getModel, getEmbeddingModel } from "../../lib/generic-ai";

// Define mock functions
const mockRegularModelFn = jest.fn().mockReturnValue('mockedOpenAIModel');
const mockRegularEmbeddingFn = jest.fn().mockReturnValue('mockedEmbeddingModel');
const mockCustomModelFn = jest.fn().mockReturnValue('mockedCustomOpenAIModel');
const mockCustomEmbeddingFn = jest.fn().mockReturnValue('mockedCustomEmbeddingModel');

// Create the mock functions with properly typed properties
const mockOpenAI = Object.assign(
  mockRegularModelFn, 
  { embedding: mockRegularEmbeddingFn }
);

const mockCustomOpenAI = Object.assign(
  mockCustomModelFn,
  { embedding: mockCustomEmbeddingFn }
);

const mockCreateOpenAI = jest.fn().mockReturnValue(mockCustomOpenAI);

// Create the mock module
jest.mock('@ai-sdk/openai', () => ({
  openai: mockOpenAI,
  createOpenAI: mockCreateOpenAI,
}));

describe("OpenAI configuration", () => {
  // Store original environment variables
  const originalOpenAIBaseURL = process.env.OPENAI_BASE_URL;
  const originalOpenAIAPIKey = process.env.OPENAI_API_KEY;

  // Before each test, reset mocks
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // After each test, restore original environment variables
  afterEach(() => {
    process.env.OPENAI_BASE_URL = originalOpenAIBaseURL;
    process.env.OPENAI_API_KEY = originalOpenAIAPIKey;
  });

  it("uses custom OpenAI configuration when OPENAI_BASE_URL is set", () => {
    // Set the environment variables
    process.env.OPENAI_BASE_URL = "https://custom-openai-provider.example.com/v1";
    process.env.OPENAI_API_KEY = "test-api-key";
    
    // Get a model
    const model = getModel("gpt-3.5-turbo", "openai");
    
    // Verify that createOpenAI was called with the correct params
    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      baseURL: "https://custom-openai-provider.example.com/v1",
      apiKey: "test-api-key",
    });
    
    // The model function should have been called with the right model name
    expect(mockCustomModelFn).toHaveBeenCalledWith("gpt-3.5-turbo");
  });

  it("uses default OpenAI configuration when OPENAI_BASE_URL is not set", () => {
    // Unset the OPENAI_BASE_URL
    process.env.OPENAI_BASE_URL = "";
    process.env.OPENAI_API_KEY = "test-api-key";
    
    // Get a model
    const model = getModel("gpt-3.5-turbo", "openai");
    
    // Verify that createOpenAI was not called again (it was called in the previous test)
    expect(mockCreateOpenAI).toHaveBeenCalledTimes(1);
    
    // The regular OpenAI model function should have been called
    expect(mockRegularModelFn).toHaveBeenCalledWith("gpt-3.5-turbo");
  });

  it("uses custom OpenAI configuration for embedding models when OPENAI_BASE_URL is set", () => {
    // Set the environment variables
    process.env.OPENAI_BASE_URL = "https://custom-openai-provider.example.com/v1";
    process.env.OPENAI_API_KEY = "test-api-key";
    
    // Get an embedding model
    const model = getEmbeddingModel("text-embedding-ada-002", "openai");
    
    // Verify that createOpenAI was called with the correct params (not again, as it was called in the first test)
    expect(mockCreateOpenAI).toHaveBeenCalledTimes(1);
    
    // The custom embedding function should have been called
    expect(mockCustomEmbeddingFn).toHaveBeenCalledWith("text-embedding-ada-002");
  });
});