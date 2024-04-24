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

export function isUrlBlocked(url: string): boolean {
  return socialMediaBlocklist.some(domain => url.includes(domain));
}
