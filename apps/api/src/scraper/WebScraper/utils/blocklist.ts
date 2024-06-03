const socialMediaBlocklist = [
  'facebook.com',
  'x.com',
  'twitter.com',
  'instagram.com',
  'linkedin.com',
  'pinterest.com',
  'snapchat.com',
  'tiktok.com',
  'reddit.com',
  'tumblr.com',
  'flickr.com',
  'whatsapp.com',
  'wechat.com',
  'telegram.org',
];

const allowedKeywords = [
  'pulse',
  'privacy',
  'terms',
  'policy',
  'user-agreement',
  'legal',
  'help',
  'support',
  'contact',
  'about',
  'careers',
  'blog',
  'press',
  'conditions',
];

export function isUrlBlocked(url: string): boolean {
  // Check if the URL contains any allowed keywords
  if (allowedKeywords.some(keyword => url.includes(keyword))) {
    return false;
  }

  try {
    // Check if the URL matches any domain in the blocklist
    return socialMediaBlocklist.some(domain => {
      // Create a regular expression to match the exact domain
      const domainPattern = new RegExp(`(^|\\.)${domain.replace('.', '\\.')}$`);
      // Test the hostname of the URL against the pattern
      return domainPattern.test(new URL(url).hostname);
    });
  } catch (e) {
    // If an error occurs (e.g., invalid URL), return false
    return false;
  }
}

