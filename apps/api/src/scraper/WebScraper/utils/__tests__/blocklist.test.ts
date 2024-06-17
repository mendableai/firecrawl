import { isUrlBlocked } from '../blocklist';

describe('Blocklist Functionality', () => {
  describe('isUrlBlocked', () => {
    test.each([
      'https://facebook.com/fake-test',
      'https://x.com/user-profile',
      'https://twitter.com/home',
      'https://instagram.com/explore',
      'https://linkedin.com/in/johndoe',
      'https://pinterest.com/pin/create',
      'https://snapchat.com/add/johndoe',
      'https://tiktok.com/@johndoe',
      'https://reddit.com/r/funny',
      'https://tumblr.com/dashboard',
      'https://flickr.com/photos/johndoe',
      'https://whatsapp.com/download',
      'https://wechat.com/features',
      'https://telegram.org/apps'
    ])('should return true for blocklisted URL %s', (url) => {
      expect(isUrlBlocked(url)).toBe(true);
    });

    test.each([
      'https://facebook.com/policy',
      'https://twitter.com/tos',
      'https://instagram.com/about/legal/terms',
      'https://linkedin.com/legal/privacy-policy',
      'https://pinterest.com/about/privacy',
      'https://snapchat.com/legal/terms',
      'https://tiktok.com/legal/privacy-policy',
      'https://reddit.com/policies',
      'https://tumblr.com/policy/en/privacy',
      'https://flickr.com/help/terms',
      'https://whatsapp.com/legal',
      'https://wechat.com/en/privacy-policy',
      'https://telegram.org/tos'
    ])('should return false for allowed URLs with keywords %s', (url) => {
      expect(isUrlBlocked(url)).toBe(false);
    });

    test('should return false for non-blocklisted domain', () => {
      const url = 'https://example.com';
      expect(isUrlBlocked(url)).toBe(false);
    });

    test('should handle invalid URLs gracefully', () => {
      const url = 'htp://invalid-url';
      expect(isUrlBlocked(url)).toBe(false);
    });
  });

  test.each([
    'https://subdomain.facebook.com',
    'https://facebook.com.someotherdomain.com',
    'https://www.facebook.com/profile',
    'https://api.twitter.com/info',
    'https://instagram.com/accounts/login'
  ])('should return true for URLs with blocklisted domains in subdomains or paths %s', (url) => {
    expect(isUrlBlocked(url)).toBe(true);
  });

  test.each([
    'https://example.com/facebook.com',
    'https://example.com/redirect?url=https://twitter.com',
    'https://facebook.com.policy.example.com'
  ])('should return false for URLs where blocklisted domain is part of another domain or path %s', (url) => {
    expect(isUrlBlocked(url)).toBe(false);
  });

  test.each([
    'https://FACEBOOK.com',
    'https://INSTAGRAM.com/@something'
  ])('should handle case variations %s', (url) => {
    expect(isUrlBlocked(url)).toBe(true);
  });

  test.each([
    'https://facebook.com?redirect=https://example.com',
    'https://twitter.com?query=something'
  ])('should handle query parameters %s', (url) => {
    expect(isUrlBlocked(url)).toBe(true);
  });

  test('should handle internationalized domain names', () => {
    const url = 'https://xn--d1acpjx3f.xn--p1ai';
    expect(isUrlBlocked(url)).toBe(false);
  });
});