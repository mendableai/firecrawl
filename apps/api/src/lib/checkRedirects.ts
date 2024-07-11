export const checksRedirect = async (initialUrl: string) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const checkRedirect = await fetch(initialUrl, { redirect: 'follow', signal: controller.signal });
    clearTimeout(timeoutId);
  
    if (checkRedirect.url && checkRedirect.url !== initialUrl) {
      console.log(`Initial URL was redirected from ${initialUrl} to ${checkRedirect.url}`);
      return checkRedirect.url;
    }
  } catch (error) {
    console.error('Error during HTTP request:', error.message);
  } 

  return initialUrl;
}

