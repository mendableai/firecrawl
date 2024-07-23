import { Logger } from "../../../lib/logger";

export async function handleCustomScraping(
  text: string,
  url: string
): Promise<{ scraper: string; url: string; waitAfterLoad?: number, pageOptions?: { scrollXPaths?: string[] } } | null> {
  // Check for Readme Docs special case
  if (text.includes('<meta name="readme-deploy"')) {
    Logger.debug(
      `Special use case detected for ${url}, using Fire Engine with wait time 1000ms`
    );
    return {
      scraper: "fire-engine",
      url: url,
      waitAfterLoad: 1000,
      pageOptions: {
        scrollXPaths: ['//*[@id="ReferencePlayground"]/section[3]/div/pre/div/div/div[5]']
      }
    };
  }

  // Check for Vanta security portals
  if (text.includes('<link href="https://static.vanta.com')) {
    Logger.debug(
      `Vanta link detected for ${url}, using Fire Engine with wait time 3000ms`
    );
    return {
      scraper: "fire-engine",
      url: url,
      waitAfterLoad: 3000,
    };
  }

  // Check for Google Drive PDF links in meta tags
  const googleDriveMetaPattern = /<meta itemprop="url" content="(https:\/\/drive\.google\.com\/file\/d\/[^"]+)"/;
  const googleDriveMetaMatch = text.match(googleDriveMetaPattern);
  if (googleDriveMetaMatch) {
    const url = googleDriveMetaMatch[1];
    Logger.debug(`Google Drive PDF link detected: ${url}`);

    const fileIdMatch = url.match(/https:\/\/drive\.google\.com\/file\/d\/([^\/]+)\/view/);
    if (fileIdMatch) {
      const fileId = fileIdMatch[1];
      const pdfUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

      return {
        scraper: "pdf",
        url: pdfUrl
      };
    }
  }
  
  return null;
}
