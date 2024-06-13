import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor } from "langchain/agents";
import { createOpenAIFunctionsAgent } from "langchain/agents";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import * as cheerio from "cheerio";
import fs from "fs";
import { Request, Response } from "express";
import { z } from "zod";
import axios from "axios";
import { FireEngineResponse } from "../lib/entities";
import { numTokensFromString } from "../lib/LLM-extraction/helpers";

export async function generateRequestParams(
  url: string,
  wait_browser: string = "domcontentloaded",
  timeout: number = 15000
): Promise<any> {
  const defaultParams = {
    url: url,
    params: { timeout: timeout, wait_browser: wait_browser },
    headers: { "ScrapingService-Request": "TRUE" },
  };
  return defaultParams;
}

export async function scrapWithFireEngine(
  url: string,
  waitFor: number = 0,
  screenshot: boolean = false,
  scrollToLoad: boolean = false,
  click: string = "",
  pageOptions: { scrollXPaths?: string[] } = {},
  headers?: Record<string, string>,
  options?: any
): Promise<FireEngineResponse> {
  try {
    const reqParams = await generateRequestParams(url);
    // If the user has passed a wait parameter in the request, use that
    const waitParam = reqParams["params"]?.wait ?? waitFor;
    const screenshotParam = reqParams["params"]?.screenshot ?? screenshot;
    console.log(
      `[Fire-Engine] Scraping ${url} with wait: ${waitParam} and screenshot: ${screenshotParam} and scrollToLoad: ${scrollToLoad}, click: ${click}`
    );

    const response = await axios.post(
      process.env.FIRE_ENGINE_BETA_URL + "/scrape",
      {
        url: url,
        wait: waitParam,
        screenshot: screenshotParam,
        scrollToLoad: scrollToLoad,
        headers: headers,
        pageOptions: pageOptions,
        click: click,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 40000,
      }
    );

    if (response.status !== 200) {
      console.error(
        `[Fire-Engine] Error fetching url: ${url} with status: ${response.status}`
      );
      return { html: "", screenshot: "" };
    }

    const contentType = response.headers["content-type"];
    console.log(`[Fire-Engine] Content type: ${contentType}`);

    const data = response.data;
    const html = data.content;
    const screenshot2 = data.screenshot;
    return { html: html ?? "", screenshot: screenshot2 ?? "" };
  } catch (error) {
    if (error.code === "ECONNABORTED") {
      console.log(`[Fire-Engine] Request timed out for ${url}`);
    } else {
      console.error(`[Fire-Engine][c] Error fetching url: ${url} -> ${error}`);
    }
    return { html: "", screenshot: "" };
  }
}

async function truncateContentToFit(
  content: string,
  maxTokens: number
): Promise<string> {
  const modifier = 4;

  let contentTotruncate = content;
  const numTokens = numTokensFromString(contentTotruncate, "gpt-4");

  if (numTokens > maxTokens) {
    // trim the document to the maximum number of tokens, tokens != characters
    contentTotruncate = content.slice(0, maxTokens * modifier);
  }
  return contentTotruncate;
}
const removeUnwantedElements = (html) => {
  const soup = cheerio.load(html);
  soup("script, style, iframe, noscript, meta, head").remove();
  return soup.html();
};
export async function smartCrawlController(req: Request, res: Response) {
  const url = req.body.url;
  const objective = req.body.objective;

  const procedures = [];

  const llm = new ChatOpenAI({
    model: "gpt-4o",
    temperature: 0,
  });
  const webDataToolSchema = z.object({
    url: z.string().describe("The url of the webpage."),
    waitFor: z
      .number()
      .describe("The number of milliseconds to wait for the page to load."),
    screenshot: z
      .boolean()
      .describe(
        "Whether to take a screenshot of the page so you can understand it visually"
      ),
    scrollToLoad: z.boolean().describe("Whether to scroll to load the page."),
    click: z
      .string()
      .describe(
        "The id, class or xpath of the element to click on. This is being fed directly to playwright click()"
      ),
  });
  const webTool = new DynamicStructuredTool({
    name: "web_tool",
    description:
      "A tool to fetch the html of a webpage. Given a url, this tool will return the page content.",
    schema: webDataToolSchema,
    func: async (input, config) => {
      const response = await scrapWithFireEngine(
        input.url,
        input.waitFor,
        input.screenshot,
        input.scrollToLoad,
        input.click
      );
      const cleanedHtml = removeUnwantedElements(response.html);
      const truncatedHtml = await truncateContentToFit(cleanedHtml, 128000);
      console.log(`[Fire-Engine] Truncated html: ${truncatedHtml.length}`);
      return truncatedHtml;
    },
  });

  // a tool to save the exact function call that the llm did
  const saveProcedure = new DynamicStructuredTool({
    name: "save_procedure",
    description: "A tool to save the exact function call that the llm did",
    schema: z.object({
      procedure: z
        .string()
        .describe(
          "The function call that the llm did with its parameters and the arguments it was called with. This is the exact schema you used."
        ),
    }),
    func: async (input, config) => {
      console.log(`[Fire-Engine] Saving procedure: ${input.procedure}`);
      procedures.push(input.procedure);
      return input.procedure;
    },
  });
  const tools = [webTool, saveProcedure];

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are a helpful assistant, master of navigating html pages and your goal is to navigate a webpage to achieve your objective. You have many tools available to you. 
      - Sometimes you won't get a result so you need to set waitFor param of the firengine to wait x millseconds so the page can load. 
      - You make your own decisions.
      - Read the html to understand the page and make wise decisions
      - You can call the tools multiple times with different paremters to have a result.
      - Don't auto scroll to the end if you don't need to, it is a really expensive operation.
      - You can only stop when you achieve your objective!
      - After every tool call, you need to call the save_procedure tool to save the exact function call that the you did. Do not save it if it doesn't help you achieve your objective or if it failed and didn't give you a good result.`,
    ],
    ["placeholder", "{chat_history}"],
    ["human", "{input}"],
    ["human", "{url}"],
    ["placeholder", "{agent_scratchpad}"],
  ]);

  // TODO: feed the cache to the agent

  const agent = await createOpenAIFunctionsAgent({
    llm,
    tools,
    prompt,
  });

  const agentExecutor = new AgentExecutor({
    agent,
    tools,
    maxIterations: 15,
  });

  const result1 = await agentExecutor.invoke({
    input: objective,
    url: url,
  });

  // if successful, save the procedure
  const cache = {
    url: [
      {
        prompt: objective,
        procedure: procedures,
        result: result1.output,
      },
    ],
  };

  // Read the existing cache from the file
  let existingCache = {};
  if (fs.existsSync("cache.json")) {
    const data = fs.readFileSync("cache.json", "utf8");
    existingCache = JSON.parse(data);
  }

  // Merge the new cache with the existing cache
  const updatedCache = {
    ...existingCache,
    [url]: [...((existingCache as any)[url] || []), ...cache.url],
  };

  // Save the updated cache to the file
  fs.writeFileSync("cache.json", JSON.stringify(updatedCache, null, 2));
  
  console.log(result1);
  return res.status(200).json({
    result: result1.output,
  });
}

// Goes to ycombinator.com/companies
// See the it is loading, so LLM decides to wait
// LLM tells the crawler to wait
// Crawler waits
// Crawler sends the data back to the planner
// LLM decides if data is enough or not, maybe there is a need to scroll to load more
// LLM tells the crawler to scroll
// Crawler scrolls
// Crawler sends the data back to the planner
// Planner sends the data back to the user

//   const cache = {
//     url: [
//       {
//         prompt: "example prompt 1",
//         procedure: [
//           {
//             tool: "web_tool",
//             input: {
//               url: "https://www.example.com",
//               waitFor: 1000,
//             },
//           },
//         ],
//         result: "example result 1",
//       },
//       {
//         prompt: "example prompt 2",
//         procedure: [
//           {
//             tool: "web_tool",
//             input: {
//               url: "https://www.example.com",
//               waitFor: 1000,
//             },
//           },
//         ],
//         result: "example result 2",
//       },
//     ],
//   };
//   const cacheFile = fs.createWriteStream("cache.json");
//   cacheFile.write(JSON.stringify(cache, null, 2));
//   cacheFile.end();
