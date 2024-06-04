export async function handleCustomScraping(
  text: string,
  url: string
): Promise<{ scraper: string; url: string; wait_after_load: number } | null> {
  // Check for Readme Docs special case
  if (text.includes('<meta name="readme-deploy"')) {
    console.log(
      `Special use case detected for ${url}, using Fire Engine with wait time 1000ms`
    );
    return {
      scraper: "fire-engine",
      url: url,
      wait_after_load: 1000,
    };
  }

  if (text.includes('<link href="https://static.vanta.com')) {
    console.log(
      `Vanta link detected for ${url}, using Fire Engine with wait time 3000ms`
    );
    return {
      scraper: "fire-engine",
      url: url,
      wait_after_load: 3000,
    };
  }

  // Check for Google Drive PDF links in the raw HTML
  const googleDrivePdfPattern =
    /https:\/\/drive\.google\.com\/file\/d\/[^\/]+\/view/;
  const googleDrivePdfLink = text.match(googleDrivePdfPattern);
  if (googleDrivePdfLink) {
    console.log(
      `Google Drive PDF link detected for ${url}: ${googleDrivePdfLink[0]}`
    );
    return {
      scraper: "fire-engine",
      url: url,
      wait_after_load: 1000,
    };
  }

  return null;
}
