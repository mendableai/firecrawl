import { Logger } from "../../../lib/logger";

export async function handleCustomScraping(
  text: string,
  url: string
): Promise<{ scraper: string; url: string; waitAfterLoad?: number, pageOptions?: { scrollXPaths?: string[] } } | null> {
  // Check for Readme Docs special case
  if (text.includes('<meta name="readme-deploy"') && !url.includes('developers.notion.com')) {
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

  // Check for Google Drive links in meta tags
  const googleDriveMetaPattern = /<meta itemprop="url" content="(https:\/\/drive\.google\.com\/file\/d\/[^"]+)"/;
  const googleDriveMetaMatch = text.match(googleDriveMetaPattern);
  if (googleDriveMetaMatch) {
    const driveItemJSON = JSON.parse(text.split("itemJson: ")[1].split("}")[0])
    const driveContentType = driveItemJSON[11];
    const url = googleDriveMetaMatch[1];
    Logger.debug(`Google Drive link detected: ${url}, type: ${driveContentType}`);

    const fileIdMatch = url.match(/https:\/\/drive\.google\.com\/file\/d\/([^\/]+)\/view/);
    if (fileIdMatch) {
      const fileId = fileIdMatch[1];
      const fileUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
      switch (driveContentType) {
        case "application/pdf":
          return {
            scraper: "pdf",
            url: fileUrl
          };
        case "text/plain":
          return {
            scraper: "text",
            url: fileUrl
          }
      }
    }
  }

  return null;
}
