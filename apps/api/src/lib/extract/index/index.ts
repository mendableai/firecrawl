import { PagesIndex } from "./providers/vectordb";
import { Pinecone } from "./providers/pinecone";
import { Qdrant } from "./providers/qdrant";

export function getIndex(): PagesIndex {
  const provider = process.env.VECTOR_DB_PROVIDER?.toLowerCase();
  switch (provider) {
    case "pinecone":
      return new Pinecone();
    case "qdrant":
      return new Qdrant();
    default:
      throw new Error(`Unsupported VECTOR_DB_PROVIDER: ${provider}`);
  }
}
