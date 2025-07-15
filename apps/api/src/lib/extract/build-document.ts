import { Document } from "../../controllers/v1/types";

export function buildDocument(document: Document): string {
  const metadata = document.metadata;
  const markdown = document.markdown;

  // for each key in the metadata allow up to 250 characters
  const metadataString = Object.entries(metadata)
    .map(([key, value]) => {
      return `${key}: ${value?.toString().slice(0, 250)}`;
    })
    .join("\n");

  const documentMetadataString = `\n- - - - - Page metadata - - - - -\n${metadataString}`;
  const documentString = `${markdown}${documentMetadataString}`;
  return documentString;
}
