import { getURLDepth, getAdjustedMaxDepth } from '../maxDepthUtils';

describe('Testing getURLDepth and getAdjustedMaxDepth', () => {
  it('should return 0 for root - mendable.ai', () => {
    const enteredURL = "https://www.mendable.ai/"
    expect(getURLDepth(enteredURL)).toBe(0);
  });

  it('should return 0 for root - scrapethissite.com', () => {
    const enteredURL = "https://scrapethissite.com/"
    expect(getURLDepth(enteredURL)).toBe(0);
  });

  it('should return 1 for scrapethissite.com/pages', () => {
    const enteredURL = "https://scrapethissite.com/pages"
    expect(getURLDepth(enteredURL)).toBe(1);
  });

  it('should return 2 for scrapethissite.com/pages/articles', () => {
    const enteredURL = "https://scrapethissite.com/pages/articles"
    expect(getURLDepth(enteredURL)).toBe(2);

  });

  it('Adjusted maxDepth should return 1 for scrapethissite.com', () => {
    const enteredURL = "https://scrapethissite.com"
    expect(getAdjustedMaxDepth(enteredURL, 1)).toBe(1);

  });

  it('Adjusted maxDepth should return 5 for scrapethissite.com/pages/articles', () => {
    const enteredURL = "https://scrapethissite.com/pages/articles"
    expect(getAdjustedMaxDepth(enteredURL, 2)).toBe(5);
  });

  
});
