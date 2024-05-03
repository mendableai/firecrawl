import request from "supertest";
import dotenv from "dotenv";
import { OpenAI } from "openai";
import path from "path";
import playwright from "playwright";
const fs = require('fs').promises;

dotenv.config();

describe("Scraping/Crawling Checkup (E2E)", () => {
  beforeAll(() => {
    if (!process.env.TEST_API_KEY) {
      throw new Error("TEST_API_KEY is not set");
    }
    if (!process.env.TEST_URL) {
      throw new Error("TEST_URL is not set");
    }
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
  });

  // restore original process.env
  afterAll(() => {
    // process.env = originalEnv;
  });

  describe("Scraping static websites", () => {
    it("should scrape the content of 5 static websites", async () => {      
      const urls = [
        'https://www.mendable.ai/blog/coachgtm-mongodb',
        'https://www.mendable.ai/blog/building-safe-rag',
        'https://www.mendable.ai/blog/gdpr-repository-pattern',
        'https://www.mendable.ai/blog/how-mendable-leverages-langsmith-to-debug-tools-and-actions',
        'https://www.mendable.ai/blog/european-data-storage'
      ];
      const expectedContent = [
        "CoachGTM, a Mendable AI Slack bot powered by MongoDB Atlas Vector Search, equips MongoDB’s teams with the knowledge and expertise they need to engage with customers meaningfully, reducing the risk of churn and fostering lasting relationships.",
        "You should consider security if you’re building LLM (Large Language Models) systems for enterprise. Over 67% percent of enterprise CEOs report a lack of trust in AI. An LLM system must protect sensitive data and refuse to take dangerous actions or it can’t be deployed in an enterprise.",
        "The biggest obstacle we encountered was breaking the strong dependency on a specific database throughout all our functions. This required weeks of diligent effort from our teams. Despite the hurdles, we remained committed to pushing forward, fixing bugs, and ultimately reaching our goal.",
        "It is no secret that 2024 will be the year we start seeing more LLMs baked into our workflows. This means that the way we interact with LLM models will be less just Question and Answer and more action-based.",
        "A major request from many of our enterprise customers has been the option for data storage in Europe. Although our existing Data Processing Agreement (DPA) with our current provider met the needs of many customers, the location of our data storage led to some potential clients choosing to wait until we had European storage."
      ]
      
      const responses = await Promise.all(urls.map(url => 
        request(process.env.TEST_URL || '')
          .post("/v0/scrape")
          .set("Content-Type", "application/json")
          .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
          .send({ url })
      ));

      for (const response of responses) {
        expect(response.statusCode).toBe(200);
        expect(response.body.data).toHaveProperty("content");
        expect(response.body.data).toHaveProperty("markdown");
        expect(response.body.data).toHaveProperty("metadata");
        expect(response.body.data.content).toContain(expectedContent[responses.indexOf(response)]);
      }
    }, 15000); // 15 seconds timeout
  })

  describe("Crawling hacker news dynamic websites", () => {
    it("should return crawl hacker news, retrieve {numberOfPages} pages, get using firecrawl vs LLM Vision and successfully compare both", async () => {
      const numberOfPages = 100;

      const hackerNewsScrape = await request(process.env.TEST_URL || '')
        .post("/v0/scrape")
        .set("Content-Type", "application/json")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .send({ url: "https://news.ycombinator.com/" });

      const scrapeUrls = [...await getRandomLinksFromContent({
        content: hackerNewsScrape.body.data.markdown,
        excludes: ['ycombinator.com', '.pdf'],
        limit: numberOfPages
      })];

      const fireCrawlResponses = await Promise.all(scrapeUrls.map(url => 
        request(process.env.TEST_URL || '')
          .post("/v0/scrape")
          .set("Content-Type", "application/json")
          .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
          .send({ url })
      ));

      const visionResponses = await Promise.all(scrapeUrls.map(url => {
        return getPageContentByScreenshot(url);
      }));

      let successCount = 0;
      const fireCrawlContents = fireCrawlResponses.map(response => response.body?.data?.content ? response.body.data.content : '');
      for (let i = 0; i < scrapeUrls.length; i++) {
        if (fuzzyContains({
          largeText: fireCrawlContents[i],
          queryText: visionResponses[i],
          threshold: 0.8
        })) {
          successCount += 1;
        } else {
          console.log(`Failed to match content for ${scrapeUrls[i]}`);
          console.log(`Firecrawl: ${fireCrawlContents[i]}`);
          console.log(`Vision: ${visionResponses[i]}`);
        }
      }

      expect(successCount/scrapeUrls.length).toBeGreaterThanOrEqual(0.9);
          
    }, 120000); // 120 seconds
  });
});

const getImageDescription = async (
  imagePath: string
): Promise<string> => {
  try {
    const prompt = `
      Get a part of the written content inside the website.
      We are going to compare if the content we retrieve contains the content of the screenshot.
      Use an easy verifiable content with close to 150 characters.
      Answer using this template: 'Content: [CONTENT]'
    `

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("No OpenAI API key provided");
    }
    // const imageMediaType = 'image/png';
    const imageBuffer = await fs.readFile(imagePath);
    const imageData = imageBuffer.toString('base64');

    const openai = new OpenAI();

    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            {
              type: "image_url",
              image_url: {
                "url": "data:image/png;base64," + imageData
              }
            },
          ],
        },
      ],
    });

    return response.choices[0].message.content?.replace("Content: ", "") || '';
  } catch (error) {
    // console.error("Error generating content from screenshot:", error);
    return '';
  }
}

const getPageContentByScreenshot = async (url: string): Promise<string> => {
  try {
    const screenshotPath = path.join(__dirname, "assets/test_screenshot.png");
    const browser = await playwright.chromium.launch();
    const page = await browser.newPage();
    await page.goto(url);
    await page.screenshot({ path: screenshotPath });
    await browser.close();
    return await getImageDescription(screenshotPath);
  } catch (error) {
    // console.error("Error generating content from screenshot:", error);
    return '';
  }
}

const getRandomLinksFromContent = async (options: { content: string, excludes: string[], limit: number }): Promise<string[]> => {
  const regex = /(?<=\()https:\/\/(.*?)(?=\))/g;
  const links = options.content.match(regex);
  const filteredLinks = links ? links.filter(link => !options.excludes.some(exclude => link.includes(exclude))) : [];
  const uniqueLinks = [...new Set(filteredLinks)]; // Ensure all links are unique
  const randomLinks = [];
  while (randomLinks.length < options.limit && uniqueLinks.length > 0) {
    const randomIndex = Math.floor(Math.random() * uniqueLinks.length);
    randomLinks.push(uniqueLinks.splice(randomIndex, 1)[0]);
  }
  return randomLinks;
}

function fuzzyContains(options: { 
  largeText: string, 
  queryText: string, 
  threshold?: number
}): boolean {
  // Normalize texts: lowercasing and removing non-alphanumeric characters
  const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ');

  const normalizedLargeText = normalize(options.largeText);
  const normalizedQueryText = normalize(options.queryText);

  // Split the query into words
  const queryWords = normalizedQueryText.split(/\s+/);

  // Count how many query words are in the large text
  const matchCount = queryWords.reduce((count, word) => {
    return count + (normalizedLargeText.includes(word) ? 1 : 0);
  }, 0);

  // Calculate the percentage of words matched
  const matchPercentage = matchCount / queryWords.length;

  // Check if the match percentage meets or exceeds the threshold
  return matchPercentage >= (options.threshold || 0.8);
}

