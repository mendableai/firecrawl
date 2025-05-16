import { createPdfCacheKey, savePdfResultToCache, getPdfResultFromCache } from '../../lib/gcs-pdf-cache';

jest.mock('@google-cloud/storage', () => {
  const mockSave = jest.fn().mockResolvedValue();
  const mockExists = jest.fn().mockResolvedValue([true]);
  const mockDownload = jest.fn().mockResolvedValue([Buffer.from(JSON.stringify({
    markdown: 'cached markdown',
    html: 'cached html'
  }))]);
  
  return {
    Storage: jest.fn().mockImplementation(() => ({
      bucket: jest.fn().mockImplementation(() => ({
        file: jest.fn().mockImplementation(() => ({
          save: mockSave,
          exists: mockExists,
          download: mockDownload
        }))
      }))
    }))
  };
});

process.env.GCS_BUCKET_NAME = 'test-bucket';

describe('PDF Caching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('createPdfCacheKey generates consistent keys', () => {
    const pdfContent1 = 'test-pdf-content';
    const pdfContent2 = 'test-pdf-content';
    const pdfContent3 = 'different-pdf-content';
    
    const key1 = createPdfCacheKey(pdfContent1);
    const key2 = createPdfCacheKey(pdfContent2);
    const key3 = createPdfCacheKey(pdfContent3);
    
    expect(key1).toBe(key2); // Same content should generate same key
    expect(key1).not.toBe(key3); // Different content should generate different key
    
    expect(key1).toMatch(/^[a-f0-9]{64}$/);
  });

  test('savePdfResultToCache saves results to GCS', async () => {
    const pdfContent = 'test-pdf-content';
    const result = { markdown: 'test markdown', html: 'test html' };
    
    const cacheKey = await savePdfResultToCache(pdfContent, result);
    
    expect(cacheKey).not.toBeNull();
    
    const { Storage } = require('@google-cloud/storage');
    const mockBucketFile = Storage().bucket().file;
    const mockSave = mockBucketFile().save;
    
    expect(mockBucketFile).toHaveBeenCalledWith(expect.stringContaining('pdf-cache/'));
    expect(mockSave).toHaveBeenCalledWith(JSON.stringify(result), {
      contentType: 'application/json'
    });
  });

  test('getPdfResultFromCache retrieves results from GCS', async () => {
    const pdfContent = 'test-pdf-content';
    
    const result = await getPdfResultFromCache(pdfContent);
    
    expect(result).not.toBeNull();
    expect(result?.markdown).toBe('cached markdown');
    expect(result?.html).toBe('cached html');
  });

  test('getPdfResultFromCache returns null when cache miss', async () => {
    const { Storage } = require('@google-cloud/storage');
    const mockExists = Storage().bucket().file().exists;
    mockExists.mockResolvedValueOnce([false]);
    
    const result = await getPdfResultFromCache('uncached-content');
    
    expect(result).toBeNull();
  });
});
