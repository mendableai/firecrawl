import * as docxProcessor from "../docxProcessor";

describe("DOCX Processing Module - Integration Test", () => {
  it("should correctly process a simple DOCX file without the LLAMAPARSE_API_KEY", async () => {
    delete process.env.LLAMAPARSE_API_KEY;
    const docxContent = await docxProcessor.fetchAndProcessDocx(
      "https://nvca.org/wp-content/uploads/2019/06/NVCA-Model-Document-Stock-Purchase-Agreement.docx"
    );
    expect(docxContent.trim()).toContain(
      "SERIES A PREFERRED STOCK PURCHASE AGREEMENT"
    );
  });
});
