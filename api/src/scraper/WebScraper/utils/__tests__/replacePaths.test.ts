import { Document } from "../../../../lib/entities";
import { replacePathsWithAbsolutePaths, replaceImgPathsWithAbsolutePaths } from "../replacePaths";

describe('replacePaths', () => {
  describe('replacePathsWithAbsolutePaths', () => {
    it('should replace relative paths with absolute paths', () => {
      const documents: Document[] = [{
        metadata: { sourceURL: 'https://example.com' },
        content: 'This is a [link](/path/to/resource).',
        markdown: 'This is a [link](/path/to/resource).'
      }];

      const expectedDocuments: Document[] = [{
        metadata: { sourceURL: 'https://example.com' },
        content: 'This is a [link](https://example.com/path/to/resource).',
        markdown: 'This is a [link](https://example.com/path/to/resource).'
      }];

      const result = replacePathsWithAbsolutePaths(documents);
      expect(result).toEqual(expectedDocuments);
    });

    it('should not alter absolute URLs', () => {
      const documents: Document[] = [{
        metadata: { sourceURL: 'https://example.com' },
        content: 'This is an [external link](https://external.com/path).',
        markdown: 'This is an [external link](https://external.com/path).'
      }];

      const result = replacePathsWithAbsolutePaths(documents);
      expect(result).toEqual(documents); // Expect no change
    });

    it('should not alter data URLs for images', () => {
      const documents: Document[] = [{
        metadata: { sourceURL: 'https://example.com' },
        content: 'This is an image: ![alt text](data:image/png;base64,ABC123==).',
        markdown: 'This is an image: ![alt text](data:image/png;base64,ABC123==).'
      }];

      const result = replacePathsWithAbsolutePaths(documents);
      expect(result).toEqual(documents); // Expect no change
    });

    it('should handle multiple links and images correctly', () => {
      const documents: Document[] = [{
        metadata: { sourceURL: 'https://example.com' },
        content: 'Here are two links: [link1](/path1) and [link2](/path2).',
        markdown: 'Here are two links: [link1](/path1) and [link2](/path2).'
      }];

      const expectedDocuments: Document[] = [{
        metadata: { sourceURL: 'https://example.com' },
        content: 'Here are two links: [link1](https://example.com/path1) and [link2](https://example.com/path2).',
        markdown: 'Here are two links: [link1](https://example.com/path1) and [link2](https://example.com/path2).'
      }];

      const result = replacePathsWithAbsolutePaths(documents);
      expect(result).toEqual(expectedDocuments);
    });

    it('should correctly handle a mix of absolute and relative paths', () => {
      const documents: Document[] = [{
        metadata: { sourceURL: 'https://example.com' },
        content: 'Mixed paths: [relative](/path), [absolute](https://example.com/path), and [data image](data:image/png;base64,ABC123==).',
        markdown: 'Mixed paths: [relative](/path), [absolute](https://example.com/path), and [data image](data:image/png;base64,ABC123==).'
      }];

      const expectedDocuments: Document[] = [{
        metadata: { sourceURL: 'https://example.com' },
        content: 'Mixed paths: [relative](https://example.com/path), [absolute](https://example.com/path), and [data image](data:image/png;base64,ABC123==).',
        markdown: 'Mixed paths: [relative](https://example.com/path), [absolute](https://example.com/path), and [data image](data:image/png;base64,ABC123==).'
      }];

      const result = replacePathsWithAbsolutePaths(documents);
      expect(result).toEqual(expectedDocuments);
    });
    
  });

  describe('replaceImgPathsWithAbsolutePaths', () => {
    it('should replace relative image paths with absolute paths', () => {
      const documents: Document[] = [{
        metadata: { sourceURL: 'https://example.com' },
        content: 'Here is an image: ![alt text](/path/to/image.jpg).',
        markdown: 'Here is an image: ![alt text](/path/to/image.jpg).'
      }];

      const expectedDocuments: Document[] = [{
        metadata: { sourceURL: 'https://example.com' },
        content: 'Here is an image: ![alt text](https://example.com/path/to/image.jpg).',
        markdown: 'Here is an image: ![alt text](https://example.com/path/to/image.jpg).'
      }];

      const result = replaceImgPathsWithAbsolutePaths(documents);
      expect(result).toEqual(expectedDocuments);
    });

    it('should not alter data:image URLs', () => {
      const documents: Document[] = [{
        metadata: { sourceURL: 'https://example.com' },
        content: 'An image with a data URL: ![alt text](data:image/png;base64,ABC123==).',
        markdown: 'An image with a data URL: ![alt text](data:image/png;base4,ABC123==).'
      }];

      const result = replaceImgPathsWithAbsolutePaths(documents);
      expect(result).toEqual(documents); // Expect no change
    });

    it('should handle multiple images with a mix of data and relative URLs', () => {
      const documents: Document[] = [{
        metadata: { sourceURL: 'https://example.com' },
        content: 'Multiple images: ![img1](/img1.jpg) ![img2](data:image/png;base64,ABC123==) ![img3](/img3.jpg).',
        markdown: 'Multiple images: ![img1](/img1.jpg) ![img2](data:image/png;base64,ABC123==) ![img3](/img3.jpg).'
      }];

      const expectedDocuments: Document[] = [{
        metadata: { sourceURL: 'https://example.com' },
        content: 'Multiple images: ![img1](https://example.com/img1.jpg) ![img2](data:image/png;base64,ABC123==) ![img3](https://example.com/img3.jpg).',
        markdown: 'Multiple images: ![img1](https://example.com/img1.jpg) ![img2](data:image/png;base64,ABC123==) ![img3](https://example.com/img3.jpg).'
      }];

      const result = replaceImgPathsWithAbsolutePaths(documents);
      expect(result).toEqual(expectedDocuments);
    });
  });
});