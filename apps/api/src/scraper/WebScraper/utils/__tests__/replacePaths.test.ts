import { Document } from "../../../../lib/entities";
import { replacePathsWithAbsolutePaths } from "../replacePaths";

describe('replacePaths', () => {
  describe('replacePathsWithAbsolutePaths', () => {
    it('should replace relative paths with absolute paths', () => {
      const document: Document = {
        metadata: { sourceURL: 'https://example.com' },
        content: 'This is a [link](/path/to/resource) and an image ![alt text](/path/to/image.jpg).'
      };

      const expectedDocument: Document = {
        metadata: { sourceURL: 'https://example.com' },
        content: 'This is a [link](https://example.com/path/to/resource) and an image ![alt text](https://example.com/path/to/image.jpg).'
      };

      
      const result = replacePathsWithAbsolutePaths(document);
      expect(result).toEqual(expectedDocument);
    });
    it('should not alter absolute URLs', () => {
      const document: Document = {
        metadata: { sourceURL: 'https://example.com' },
        content: 'This is an [external link](https://external.com/path) and an image ![alt text](https://example.com/path/to/image.jpg).'
      };

      const result = replacePathsWithAbsolutePaths(document);
      expect(result).toEqual(document); // Expect no change
    });

    it('should not alter data URLs for images', () => {
      const document: Document = {
        metadata: { sourceURL: 'https://example.com' },
        content: 'This is an image: ![alt text](data:image/png;base64,ABC123==).'
      };

      const result = replacePathsWithAbsolutePaths(document);
      expect(result).toEqual(document); // Expect no change
    });

    it('should handle multiple links and images correctly', () => {
      const document: Document = {
        metadata: { sourceURL: 'https://example.com' },
        content: 'Here are two links: [link1](/path1) and [link2](/path2), and two images: ![img1](/img1.jpg) ![img2](/img2.jpg).'
      };

      const expectedDocument: Document = {
        metadata: { sourceURL: 'https://example.com' },
        content: 'Here are two links: [link1](https://example.com/path1) and [link2](https://example.com/path2), and two images: ![img1](https://example.com/img1.jpg) ![img2](https://example.com/img2.jpg).'
      };

      const result = replacePathsWithAbsolutePaths(document);
      expect(result).toEqual(expectedDocument);
    });

    it('should correctly handle a mix of absolute and relative paths', () => {
      const document: Document = {
        metadata: { sourceURL: 'https://example.com' },
        content: 'Mixed paths: [relative](/path), [absolute](https://example.com/path), and [data image](data:image/png;base64,ABC123==).'
      };

      const expectedDocument: Document = {
        metadata: { sourceURL: 'https://example.com' },
        content: 'Mixed paths: [relative](https://example.com/path), [absolute](https://example.com/path), and [data image](data:image/png;base64,ABC123==).'
      };

      const result = replacePathsWithAbsolutePaths(document);
      expect(result).toEqual(expectedDocument);
    });
  });
});
