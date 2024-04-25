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

const allowedUrls = [
  'linkedin.com/pulse'
];

export function isUrlBlocked(url: string): boolean {
  if (allowedUrls.some(allowedUrl => url.includes(allowedUrl))) {
    return false;
  }

  return socialMediaBlocklist.some(domain => url.includes(domain));
}
