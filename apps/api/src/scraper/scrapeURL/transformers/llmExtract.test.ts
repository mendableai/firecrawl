import { removeDefaultProperty } from "./llmExtract";
import { truncateText } from "./llmExtract";
import { encoding_for_model } from "@dqbd/tiktoken";

jest.mock("@dqbd/tiktoken", () => ({
  encoding_for_model: jest.fn(),
}));

describe("removeDefaultProperty", () => {
  it("should remove the default property from a simple object", () => {
    const input = { default: "test", test: "test" };
    const expectedOutput = { test: "test" };
    expect(removeDefaultProperty(input)).toEqual(expectedOutput);
  });

  it("should remove the default property from a nested object", () => {
    const input = {
      default: "test",
      nested: { default: "nestedTest", test: "nestedTest" },
    };
    const expectedOutput = { nested: { test: "nestedTest" } };
    expect(removeDefaultProperty(input)).toEqual(expectedOutput);
  });

  it("should remove the default property from an array of objects", () => {
    const input = {
      array: [
        { default: "test1", test: "test1" },
        { default: "test2", test: "test2" },
      ],
    };
    const expectedOutput = { array: [{ test: "test1" }, { test: "test2" }] };
    expect(removeDefaultProperty(input)).toEqual(expectedOutput);
  });

  it("should handle objects without a default property", () => {
    const input = { test: "test" };
    const expectedOutput = { test: "test" };
    expect(removeDefaultProperty(input)).toEqual(expectedOutput);
  });

  it("should handle null and non-object inputs", () => {
    expect(removeDefaultProperty(null)).toBeNull();
    expect(removeDefaultProperty("string")).toBe("string");
    expect(removeDefaultProperty(123)).toBe(123);
  });
});

describe("truncateText", () => {
  const mockEncode = jest.fn();
  const mockEncoder = {
    encode: mockEncode,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (encoding_for_model as jest.Mock).mockReturnValue(mockEncoder);
  });

  it("should return the original text if it's within token limit", () => {
    const text = "This is a short text";
    mockEncode.mockReturnValue(new Array(5)); // Simulate 5 tokens

    const result = truncateText(text, 10);
    expect(result).toBe(text);
    expect(mockEncode).toHaveBeenCalledWith(text);
  });

  it("should truncate text that exceeds token limit", () => {
    const text = "This is a longer text that needs truncation";
    mockEncode.mockReturnValue(new Array(20)); // Simulate 20 tokens

    const result = truncateText(text, 10);
    expect(result.length).toBeLessThan(text.length);
    expect(mockEncode).toHaveBeenCalled();
  });

  it("should handle empty string", () => {
    const text = "";
    mockEncode.mockReturnValue([]);

    const result = truncateText(text, 10);
    expect(result).toBe("");
    expect(mockEncode).toHaveBeenCalledWith("");
  });

  it("should use character-based fallback when encoder throws error", () => {
    const text = "This is some text";
    mockEncode.mockImplementation(() => {
      throw new Error("Encoder error");
    });

    const result = truncateText(text, 5);
    // With modifier of 3, should truncate to approximately 15 characters
    expect(result.length).toBeLessThanOrEqual(15);
  });

  it("should handle very short max token limits", () => {
    const text = "Short text";
    mockEncode.mockReturnValue(new Array(10));

    const result = truncateText(text, 1);
    expect(result.length).toBeLessThan(text.length);
  });

  it("should handle zero max tokens", () => {
    const text = "Some text";
    mockEncode.mockReturnValue(new Array(2));

    const result = truncateText(text, 0);
    expect(result).toBe("");
  });

  it("should handle extremely large text exceeding model context", () => {
    // Create a very large text (e.g., 100,000 characters)
    const text = "a".repeat(100000);
    
    // First call: simulate 25000 tokens
    mockEncode.mockReturnValueOnce(new Array(25000));
    // Subsequent calls: simulate gradually decreasing token counts
    // This simulates the iterative truncation process
    mockEncode
      .mockReturnValueOnce(new Array(20000))
      .mockReturnValueOnce(new Array(15000))
      .mockReturnValueOnce(new Array(12000))
      .mockReturnValueOnce(new Array(9000));

    const result = truncateText(text, 10000); // Common model context limit
    
    // The result should be significantly shorter but not empty
    expect(result.length).toBeLessThan(text.length);
    expect(result.length).toBeGreaterThan(0);
    // Given our new conservative approach, we should have a substantial amount of text
    expect(result.length).toBeGreaterThan(30000); // At least 30% of original
    expect(mockEncode).toHaveBeenCalled();
    
    // Log the actual length for verification
    console.log("Result length:", result.length, "characters");
  });
});
