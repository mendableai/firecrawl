import { SearchProvider } from "./types";
import { SerperProvider } from "./providers/serperProvider";
import { SearchApiProvider } from "./providers/searchApiProvider";
import { GoogleScraperProvider } from "./providers/googleScraperProvider";
import { ProviderType } from "./types";

export class ProviderFactory {
  static createProvider(type: ProviderType): SearchProvider {
    switch (type) {
      case ProviderType.SERPER:
        return new SerperProvider(process.env.SERPER_API_KEY!);
      case ProviderType.SEARCHAPI:
        return new SearchApiProvider(process.env.SEARCHAPI_API_KEY!);
      case ProviderType.GOOGLE:
        return new GoogleScraperProvider();
      default:
        console.error(`Invalid provider type: ${type}`);
        throw new Error(`Unknown provider type: ${type}`);
    }
  }
}
