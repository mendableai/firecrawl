import { normalizeUrl } from '../normalizeUrl';

describe('normalizeUrl', () => {
  it('should convert the scheme and host to lowercase', () => {
    const result = normalizeUrl('HTTP://WWW.EXAMPLE.COM');
    expect(result).toBe('https://www.example.com/');
  });

  it('should remove default ports', () => {
    const result80 = normalizeUrl('http://www.example.com:80');
    const result443 = normalizeUrl('https://www.example.com:443');
    expect(result80).toBe('https://www.example.com/');
    expect(result443).toBe('https://www.example.com/');
  });

  it('should sort query parameters', () => {
    const result = normalizeUrl('http://www.example.com?&a=1&b=2');
    expect(result).toBe('https://www.example.com?a=1&b=2');
  });

  it('should remove the fragment', () => {
    const result = normalizeUrl('http://www.example.com#section');
    expect(result).toBe('https://www.example.com/');
  });

  it('should remove trailing slash unless the path is empty', () => {
    const resultWithPath = normalizeUrl('http://www.example.com/path/');
    const resultWithoutPath = normalizeUrl('http://www.example.com/');
    expect(resultWithPath).toBe('https://www.example.com/path');
    expect(resultWithoutPath).toBe('https://www.example.com/');
  });

  it('should convert http URLs to https', () => {
    const result = normalizeUrl('http://www.example.com');
    expect(result).toBe('https://www.example.com/');
  });

  it('should handle complex URLs with multiple query parameters and subdomains', () => {
    const result = normalizeUrl('http://sub2.sub1.example.com:80/path/to/resource?z=26&y=25&x=24');
    expect(result).toBe('https://sub2.sub1.example.com/path/to/resource?x=24&y=25&z=26');
  });

  it('should handle URLs with encoded characters in the path', () => {
    const result = normalizeUrl('https://www.example.com/some%20path%20with%20spaces/');
    expect(result).toBe('https://www.example.com/some%20path%20with%20spaces');
  });

  it('should handle URLs with multiple subdomains and a port', () => {
    const result = normalizeUrl('http://a.b.c.d.e.f.example.com:8080');
    expect(result).toBe('https://a.b.c.d.e.f.example.com:8080/');
  });

  it('should handle URLs with unusual but valid query parameters', () => {
    const result = normalizeUrl('http://example.com/?a=1&b=&c=3&d=hello%20world');
    expect(result).toBe('https://example.com?a=1&b=&c=3&d=hello+world');
  });

  it('should handle URLs with punycode domain names', () => {
    const result = normalizeUrl('http://xn--d1acpjx3f.xn--p1ai');
    expect(result).toBe('https://xn--d1acpjx3f.xn--p1ai/');
  });
});
