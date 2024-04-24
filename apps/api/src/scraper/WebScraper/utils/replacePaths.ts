import { Document } from "../../../lib/entities";

export const replacePathsWithAbsolutePaths = (documents: Document[]): Document[] => {
  try {
    documents.forEach((document) => {
      const baseUrl = new URL(document.metadata.sourceURL).origin;
      const paths =
        document.content.match(
          /(!?\[.*?\])\(((?:[^()]+|\((?:[^()]+|\([^()]*\))*\))*)\)|href="([^"]+)"/g
        ) || [];

      paths.forEach((path: string) => {
        const isImage = path.startsWith("!");
        let matchedUrl = path.match(/\(([^)]+)\)/) || path.match(/href="([^"]+)"/);
        let url = matchedUrl[1];

        if (!url.startsWith("data:") && !url.startsWith("http")) {
          if (url.startsWith("/")) {
            url = url.substring(1);
          }
          url = new URL(url, baseUrl).toString();
        }

        const markdownLinkOrImageText = path.match(/(!?\[.*?\])/)[0];
        if (isImage) {
          document.content = document.content.replace(
            path,
            `${markdownLinkOrImageText}(${url})`
          );
        } else {
          document.content = document.content.replace(
            path,
            `${markdownLinkOrImageText}(${url})`
          );
        }
      });
    });

    return documents;
  } catch (error) {
    console.error("Error replacing paths with absolute paths", error);
    return documents;
  }
};

export const replaceImgPathsWithAbsolutePaths = (documents: Document[]): Document[] => {
  try {
    documents.forEach((document) => {
      const baseUrl = new URL(document.metadata.sourceURL).origin;
      const images =
        document.content.match(
          /!\[.*?\]\(((?:[^()]+|\((?:[^()]+|\([^()]*\))*\))*)\)/g
        ) || [];

      images.forEach((image: string) => {
        let imageUrl = image.match(/\(([^)]+)\)/)[1];
        let altText = image.match(/\[(.*?)\]/)[1];

        if (!imageUrl.startsWith("data:image")) {
          if (!imageUrl.startsWith("http")) {
            if (imageUrl.startsWith("/")) {
              imageUrl = imageUrl.substring(1);
            }
            imageUrl = new URL(imageUrl, baseUrl).toString();
          }
        }

        document.content = document.content.replace(
          image,
          `![${altText}](${imageUrl})`
        );
      });
    });

    return documents;
  } catch (error) {
    console.error("Error replacing img paths with absolute paths", error);
    return documents;
  }
};