import { parseGoogleSearchResults } from "./googleDomParser";
import { SearchResult } from "../../lib/entities";

// Mock the SearchResult class
jest.mock("../../lib/entities", () => {
  return {
    SearchResult: jest.fn(
      (link: string, title: string, description: string) => ({
        link,
        title,
        description,
      }),
    ),
  };
});

describe("parseGoogleSearchResults", () => {
  it("should parse search results from valid HTML", () => {
    const html = `
      <div class="g">
        <a href="http://example.com"></a>
        <h3>Example Title</h3>
        <div style="-webkit-line-clamp:2">Example Description</div>
      </div>
    `;

    const results = parseGoogleSearchResults(html);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      link: "http://example.com",
      title: "Example Title",
      description: "Example Description",
    });
  });

  it("should handle multiple results in the HTML", () => {
    const html = `
      <div class="g">
        <a href="http://example1.com"></a>
        <h3>Example Title 1</h3>
        <div style="-webkit-line-clamp:2">Example Description 1</div>
      </div>
      <div class="g">
        <a href="http://example2.com"></a>
        <h3>Example Title 2</h3>
        <div style="-webkit-line-clamp:2">Example Description 2</div>
      </div>
    `;

    const results = parseGoogleSearchResults(html);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      link: "http://example1.com",
      title: "Example Title 1",
      description: "Example Description 1",
    });
    expect(results[1]).toEqual({
      link: "http://example2.com",
      title: "Example Title 2",
      description: "Example Description 2",
    });
  });

  it("should exclude entries with missing data", () => {
    const html = `
      <div class="g">
        <a href="http://example.com"></a>
        <h3>Example Title</h3>
        <div style="-webkit-line-clamp:2"></div>
      </div>
    `;

    const results = parseGoogleSearchResults(html);

    expect(results).toHaveLength(0);
  });

  it("should parse the answer box if present", () => {
    const html = `
      <div class="mod">Answer Box Content</div>
    `;

    const results = parseGoogleSearchResults(html);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      link: "",
      title: "Answer Box",
      description: "Answer Box Content",
    });
  });

  it("should handle a mix of regular results and answer box", () => {
    const html = `
      <div class="g">
        <a href="http://example.com"></a>
        <h3>Example Title</h3>
        <div style="-webkit-line-clamp:2">Example Description</div>
      </div>
      <div class="mod">Answer Box Content</div>
    `;

    const results = parseGoogleSearchResults(html);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      link: "http://example.com",
      title: "Example Title",
      description: "Example Description",
    });
    expect(results[1]).toEqual({
      link: "",
      title: "Answer Box",
      description: "Answer Box Content",
    });
  });

  it("should return an empty array if no results or answer box are present", () => {
    const html = `
      <div class="other-class">No relevant content here</div>
    `;

    const results = parseGoogleSearchResults(html);

    expect(results).toHaveLength(0);
  });

  it("should handle empty input HTML", () => {
    const html = "";

    const results = parseGoogleSearchResults(html);

    expect(results).toHaveLength(0);
  });
});
