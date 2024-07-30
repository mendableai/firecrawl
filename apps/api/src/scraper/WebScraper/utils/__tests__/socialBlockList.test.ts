import { Logger } from '../../../../lib/logger';
import { isUrlBlocked } from '../blocklist';

describe('isUrlBlocked', () => {
  it('should return true for blocked social media URLs', () => {
    const blockedUrls = [
      'https://www.facebook.com',
      'https://twitter.com/someuser',
      'https://instagram.com/someuser',
      'https://www.linkedin.com/in/someuser',
      'https://pinterest.com/someuser',
      'https://snapchat.com/someuser',
      'https://tiktok.com/@someuser',
      'https://reddit.com/r/somesubreddit',
      'https://flickr.com/photos/someuser',
      'https://whatsapp.com/someuser',
      'https://wechat.com/someuser',
      'https://telegram.org/someuser',
    ];

    blockedUrls.forEach(url => {
      if (!isUrlBlocked(url)) {
        Logger.debug(`URL not blocked: ${url}`);
      }
      expect(isUrlBlocked(url)).toBe(true);
    });
  });

  it('should return false for URLs containing allowed keywords', () => {
    const allowedUrls = [
      'https://www.facebook.com/privacy',
      'https://twitter.com/terms',
      'https://instagram.com/legal',
      'https://www.linkedin.com/help',
      'https://pinterest.com/about',
      'https://snapchat.com/support',
      'https://tiktok.com/contact',
      'https://reddit.com/user-agreement',
      'https://tumblr.com/policy',
      'https://flickr.com/blog',
      'https://whatsapp.com/press',
      'https://wechat.com/careers',
      'https://telegram.org/conditions',
      'https://wix.com/careers',
    ];

    allowedUrls.forEach(url => {
      expect(isUrlBlocked(url)).toBe(false);
    });
  });

  it('should return false for non-blocked URLs', () => {
    const nonBlockedUrls = [
      'https://www.example.com',
      'https://www.somewebsite.org',
      'https://subdomain.example.com',
      'firecrawl.dev',
      'amazon.com',
      'wix.com',
      'https://wix.com'
    ];

    nonBlockedUrls.forEach(url => {
      expect(isUrlBlocked(url)).toBe(false);
    });
  });
});
