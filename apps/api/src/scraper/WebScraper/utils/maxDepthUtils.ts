

export function getAdjustedMaxDepth(url: string, maxCrawlDepth: number): number {
  const baseURLDepth = getURLDepth(url);
  const adjustedMaxDepth = maxCrawlDepth + baseURLDepth;
  return adjustedMaxDepth;
}

export function getURLDepth(url: string): number {
  const pathSplits = new URL(url).pathname.split('/');
  return pathSplits.length - (pathSplits[0].length === 0 && pathSplits[pathSplits.length - 1].length === 0 ? 1 : 0) - 1;
}
