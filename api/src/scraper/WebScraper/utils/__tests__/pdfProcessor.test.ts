import * as pdfProcessor from '../pdfProcessor';

describe('PDF Processing Module - Integration Test', () => {
  it('should correctly process a simple PDF file without the LLAMAPARSE_API_KEY', async () => {
    delete process.env.LLAMAPARSE_API_KEY;
    const { content, pageStatusCode, pageError } = await pdfProcessor.fetchAndProcessPdf('https://s3.us-east-1.amazonaws.com/storage.mendable.ai/rafa-testing/test%20%281%29.pdf', true);
    expect(content.trim()).toEqual("Dummy PDF file");
    expect(pageStatusCode).toEqual(200);
    expect(pageError).toBeUndefined();
  });

  it('should return a successful response for a valid scrape with PDF file and parsePDF set to false', async () => {
    const { content, pageStatusCode, pageError } = await pdfProcessor.fetchAndProcessPdf('https://arxiv.org/pdf/astro-ph/9301001.pdf', false);
    expect(pageStatusCode).toBe(200);
    expect(pageError).toBeUndefined();
    expect(content).toContain('/Title(arXiv:astro-ph/9301001v1  7 Jan 1993)>>endobj');
  }, 60000); // 60 seconds

});
