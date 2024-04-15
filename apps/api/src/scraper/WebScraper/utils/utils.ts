import axios from "axios";

export async function attemptScrapWithRequests(
  urlToScrap: string
): Promise<string | null> {
  try {
    const response = await axios.get(urlToScrap);

    if (!response.data) {
      console.log("Failed normal requests as well");
      return null;
    }

    return response.data;
  } catch (error) {
    console.error(`Error in attemptScrapWithRequests: ${error}`);
    return null;
  }
}

export function sanitizeText(text: string): string {
  return text.replace("\u0000", "");
}
