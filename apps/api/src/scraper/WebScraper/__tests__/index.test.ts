import { WebScraperDataProvider } from '../index';

describe('WebScraperDataProvider', () => {
  describe('replaceImgPathsWithAbsolutePaths', () => {
    it('should replace image paths with absolute paths', () => {
      const webScraperDataProvider = new WebScraperDataProvider();
      const documents = [
        {
          metadata: { sourceURL: 'https://example.com/page' },
          content: '![alt text](/image.png)',
        },
        {
          metadata: { sourceURL: 'https://example.com/another-page' },
          content: '![another alt text](./another-image.png)',
        },
        {
          metadata: { sourceURL: 'https://example.com/data-image' },
          content: '![data image](data:image/png;base64,...)',
        }
      ];

      const expectedDocuments = [
        {
          metadata: { sourceURL: 'https://example.com/page' },
          content: '![alt text](https://example.com/image.png)',
        },
        {
          metadata: { sourceURL: 'https://example.com/another-page' },
          content: '![another alt text](https://example.com/another-image.png)',
        },
        {
          metadata: { sourceURL: 'https://example.com/data-image' },
          content: '![data image](data:image/png;base64,...)',
        }
      ];

      const result = webScraperDataProvider.replaceImgPathsWithAbsolutePaths(documents);
      expect(result).toEqual(expectedDocuments);
    });

    it('should handle absolute URLs without modification', () => {
      const webScraperDataProvider = new WebScraperDataProvider();
      const documents = [
        {
          metadata: { sourceURL: 'https://example.com/page' },
          content: '![alt text](https://example.com/image.png)',
        },
        {
          metadata: { sourceURL: 'https://example.com/another-page' },
          content: '![another alt text](http://anotherexample.com/another-image.png)',
        }
      ];

      const expectedDocuments = [
        {
          metadata: { sourceURL: 'https://example.com/page' },
          content: '![alt text](https://example.com/image.png)',
        },
        {
          metadata: { sourceURL: 'https://example.com/another-page' },
          content: '![another alt text](http://anotherexample.com/another-image.png)',
        }
      ];

      const result = webScraperDataProvider.replaceImgPathsWithAbsolutePaths(documents);
      expect(result).toEqual(expectedDocuments);
    });

    it('should not replace non-image content within the documents', () => {
      const webScraperDataProvider = new WebScraperDataProvider();
      const documents = [
        {
          metadata: { sourceURL: 'https://example.com/page' },
          content: 'This is a test. ![alt text](/image.png) Here is a link: [Example](https://example.com).',
        },
        {
          metadata: { sourceURL: 'https://example.com/another-page' },
          content: 'Another test. ![another alt text](./another-image.png) Here is some **bold text**.',
        }
      ];
    
      const expectedDocuments = [
        {
          metadata: { sourceURL: 'https://example.com/page' },
          content: 'This is a test. ![alt text](https://example.com/image.png) Here is a link: [Example](https://example.com).',
        },
        {
          metadata: { sourceURL: 'https://example.com/another-page' },
          content: 'Another test. ![another alt text](https://example.com/another-image.png) Here is some **bold text**.',
        }
      ];
    
      const result = webScraperDataProvider.replaceImgPathsWithAbsolutePaths(documents);
      expect(result).toEqual(expectedDocuments);
    });
  });
});