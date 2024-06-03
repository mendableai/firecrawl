// pages/api/getRepoStars.ts
import { NextApiRequest, NextApiResponse } from 'next';
import FirecrawlApp from '@mendable/firecrawl-js';
import { roastPrompt } from '../../lib/LLM/llm';


const mildPrompt = "Give me a light hearted roast for this website:"
const mediumPrompt = "Give me a roast for this website:"
const spicyPrompt ="Roast this website. The person who made this website wants to be roasted really hard. I mean REALLY hard, don't hold back, and don't worry about hurting their feelings. Be mean but concisely mean. No more than 2 paragraphs."


async function getScreenShotAndHtml(url: string) {
    const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });
    const scrapeResult = await app.scrapeUrl(url, {
        pageOptions: {
            includeHtml: true,
            screenshot: true
        }
    });
    return {
        screenshotUrl: scrapeResult.data.metadata.screenshot,
        htmlContent: scrapeResult.data.html
    };
}


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const rawUrl = typeof req.query.url === 'string' ? req.query.url : null;
  const spiceLevel = typeof req.query.spiceLevel === 'string' ? parseInt(req.query.spiceLevel, 10) : null;

  if (!rawUrl || spiceLevel === null || isNaN(spiceLevel)) {
    res.status(400).json({ error: 'Invalid query parameters' });
    return;
  }

  try {
    const { screenshotUrl, htmlContent } = await getScreenShotAndHtml(rawUrl);
    
    // Define a roast prompt message
    let roastMessage: string;

    // Determine the roast message based on the spice level
    switch (spiceLevel) {
      case 1:
        roastMessage = mildPrompt;
        break;
      case 2:
        roastMessage = mediumPrompt;
        break;
      case 3:
        roastMessage = spicyPrompt;
        break;
      default:
        // If an invalid spice level is provided, default to mild roast
        roastMessage = mildPrompt;
        res.status(400).json({ error: 'Invalid spice level' });
        return;
    }



    // Convert HTML content to a markdown-like format for the roast generation
    // This is a simplified conversion, assuming HTML content is already sanitized and suitable for direct usage

    // Call the roastPrompt function to generate a roast
    const roastResult = await roastPrompt(roastMessage, screenshotUrl, htmlContent);

    // Log the roast result for debugging
    // console.log("Roast Result:", roastResult);

    res.status(200).json({ screenshotUrl, htmlContent, roastResult});
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

