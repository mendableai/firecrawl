import { describe, it, expect } from '@jest/globals';

function transformIframeSelector(selector: string): string {
  return selector.replace(/(?:^|[\s,])iframe(?=\s|$|[.#\[:,])/g, (match) => {
    const prefix = match.match(/^[\s,]/)?.[0] || '';
    return prefix + 'div[data-original-tag="iframe"]';
  });
}

describe('iframe selector transformation', () => {
  describe('transformIframeSelector', () => {
    it('should transform basic iframe selector', () => {
      expect(transformIframeSelector('iframe')).toBe('div[data-original-tag="iframe"]');
    });

    it('should transform iframe with class selector', () => {
      expect(transformIframeSelector('iframe.video')).toBe('div[data-original-tag="iframe"].video');
      expect(transformIframeSelector('iframe.video.player')).toBe('div[data-original-tag="iframe"].video.player');
    });

    it('should transform iframe with id selector', () => {
      expect(transformIframeSelector('iframe#main-video')).toBe('div[data-original-tag="iframe"]#main-video');
    });

    it('should transform iframe with attribute selector', () => {
      expect(transformIframeSelector('iframe[src*="youtube"]')).toBe('div[data-original-tag="iframe"][src*="youtube"]');
    });

    it('should transform iframe with pseudo-class', () => {
      expect(transformIframeSelector('iframe:first-child')).toBe('div[data-original-tag="iframe"]:first-child');
    });

    it('should handle complex selectors with combinators', () => {
      expect(transformIframeSelector('div iframe')).toBe('div div[data-original-tag="iframe"]');
      expect(transformIframeSelector('iframe > div')).toBe('div[data-original-tag="iframe"] > div');
      expect(transformIframeSelector('div + iframe')).toBe('div + div[data-original-tag="iframe"]');
      expect(transformIframeSelector('iframe ~ p')).toBe('div[data-original-tag="iframe"] ~ p');
    });

    it('should handle multiple iframe selectors in one string', () => {
      expect(transformIframeSelector('iframe, iframe.video')).toBe('div[data-original-tag="iframe"], div[data-original-tag="iframe"].video');
    });

    it('should not transform partial matches', () => {
      expect(transformIframeSelector('div.iframe-container')).toBe('div.iframe-container');
      expect(transformIframeSelector('iframe-wrapper')).toBe('iframe-wrapper');
      expect(transformIframeSelector('my-iframe')).toBe('my-iframe');
    });

    it('should handle edge cases', () => {
      expect(transformIframeSelector('')).toBe('');
      expect(transformIframeSelector('div')).toBe('div');
      expect(transformIframeSelector('iframe iframe')).toBe('div[data-original-tag="iframe"] div[data-original-tag="iframe"]');
    });

    it('should handle complex real-world selectors', () => {
      expect(transformIframeSelector('iframe.embed-responsive-item')).toBe('div[data-original-tag="iframe"].embed-responsive-item');
      expect(transformIframeSelector('.container iframe[src*="youtube.com"]')).toBe('.container div[data-original-tag="iframe"][src*="youtube.com"]');
      expect(transformIframeSelector('iframe:not(.hidden)')).toBe('div[data-original-tag="iframe"]:not(.hidden)');
    });
  });

  describe('array transformation', () => {
    it('should transform arrays of selectors', () => {
      const selectors = ['iframe', 'iframe.video', 'div.content'];
      const transformed = selectors.map(transformIframeSelector);
      expect(transformed).toEqual([
        'div[data-original-tag="iframe"]',
        'div[data-original-tag="iframe"].video',
        'div.content'
      ]);
    });

    it('should handle empty arrays', () => {
      const selectors: string[] = [];
      const transformed = selectors.map(transformIframeSelector);
      expect(transformed).toEqual([]);
    });
  });
});
