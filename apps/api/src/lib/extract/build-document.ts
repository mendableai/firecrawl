import { Document } from "../../controllers/v1/types";

export function buildDocument(document: Document): string {
  const metadata = document.metadata;
  const markdown = document.markdown;

  const documentMetadataString = `\nHere is the metadata for the document:\n${JSON.stringify(
    metadata,
    null,
    2
  )}`;

  const documentString = `${markdown}${documentMetadataString}`;

  console.log("documentString", documentString);
  return markdown ?? "";
}
