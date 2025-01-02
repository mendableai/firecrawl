export interface SearchResult {
  url: string;
  title: string;
  description: string;
}

export interface SearchOptions {
  q: string;
  num_results: number;
  lang?: string;
  country?: string;
  location?: string;
  page?: number;
  tbs?: string;
  filter?: string;
  proxies?: any;
  sleep_interval?: number;
  timeout?: number;
}

export interface SearchProvider {
  search(options: SearchOptions): Promise<SearchResult[]>;
}

export enum ProviderType {
  SERPER = "serper",
  SEARCHAPI = "searchapi",
  GOOGLE = "google",
}
