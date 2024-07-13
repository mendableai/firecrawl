export const normalizeUrl = (url: string) => {
  let normalizedUrl = new URL(url);
  let removeSlash = false;

  // Convert the scheme and host to lowercase
  normalizedUrl.protocol = normalizedUrl.protocol.toLowerCase();
  normalizedUrl.host = normalizedUrl.host.toLowerCase();

  // Replace http with https if not localhost or 127.0.0.1
  if (!['localhost', '127.0.0.1'].includes(normalizedUrl.hostname) && normalizedUrl.protocol === 'http:') {
    normalizedUrl.protocol = 'https:';
  }

  // Remove default port numbers
  normalizedUrl.port = normalizedUrl.port === '80' || normalizedUrl.port === '443' ? '' : normalizedUrl.port;

  // Sort query parameters
  let params = Array.from(normalizedUrl.searchParams);
  params.sort((a, b) => a[0].localeCompare(b[0]));
  normalizedUrl.search = new URLSearchParams(params).toString();

  // Remove the fragment
  normalizedUrl.hash = '';

  console.log('normalizedUrl.pathname', normalizedUrl.pathname);
  console.log('normalizedUrl.search', normalizedUrl.search);
  
  if (normalizedUrl.pathname === '/' && normalizedUrl.search) {
    removeSlash = true;
  } else if (normalizedUrl.pathname.endsWith('/') && normalizedUrl.search === '') {
    normalizedUrl.pathname = normalizedUrl.pathname.slice(0, -1); // Remove trailing slash if no query parameters
  }

  console.log({removeSlash})
  if (removeSlash) {
    return normalizedUrl.toString().replace('/?', '?');
  }

  return normalizedUrl.toString();
}