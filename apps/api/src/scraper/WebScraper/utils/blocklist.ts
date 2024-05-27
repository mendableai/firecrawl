const socialMediaBlocklist = [
  'facebook.com',
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
  if (allowedKeywords.some(keyword => url.includes(keyword))) {
    return false;
  }

  return socialMediaBlocklist.some(domain => url.includes(domain));
}
