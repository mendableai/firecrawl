import { logger as _logger } from "../logger";
import {
  DeepResearchActivity,
  DeepResearchFinding,
  DeepResearchSource,
  updateDeepResearch,
} from "./deep-research-redis";
import { generateText } from "../llm/generate";
import { PlanType } from "../../types";
import { searchAndScrapeSearchResult } from "../../controllers/v1/search";
import {
  generateOpenAICompletions,
  truncateText,
} from "../../scraper/scrapeURL/transformers/llmExtract";

interface DeepResearchServiceOptions {
  researchId: string;
  teamId: string;
  plan: string;
  topic: string;
  maxDepth: number;
  timeLimit: number;
}

interface AnalysisResult {
  summary: string;
  gaps: string[];
  nextSteps: string[];
  shouldContinue: boolean;
  nextSearchTopic?: string;
  urlToSearch?: string;
}

async function generateSearchQueries(
  topic: string,
  findings: DeepResearchFinding[] = [],
): Promise<{ query: string; researchGoal: string }[]> {
  const { extract } = await generateOpenAICompletions(
    _logger.child({
      method: "generateSearchQueries",
    }),
    {
      mode: "llm",
      systemPrompt:
        "You are an expert research agent that generates search queries (SERP) to explore topics deeply and thoroughly. Do not generate repated queries. Today's date is " +
        new Date().toISOString().split("T")[0],
      schema: {
        type: "object",
        properties: {
          queries: {
            type: "array",
            items: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The search query to use",
                },
                researchGoal: {
                  type: "string",
                  description:
                    "The specific goal this query aims to achieve and how it advances the research",
                },
              },
            },
          },
        },
      },
      prompt: `Generate a list of 3-5 search queries to deeply research this topic: "${topic}"
      ${findings.length > 0 ? `\nBased on these previous findings, generate more specific queries:\n${findings.map((f) => `- ${truncateText(f.text, 15000)}`).join("\n")}` : ""}
      
      Each query should be specific and focused on a particular aspect.
      Build upon previous findings when available.
      Every search query is a new SERP query so make sure the whole context is added without overwhelming the search engine.
      
      If applicaable, return queries that will help uncover different aspects and perspectives of the topic - always folowing the users intent. Include the topic on the queries.`,
    },
    "",
    undefined,
    true,
  );

  return extract.queries;
}

export async function performDeepResearch(options: DeepResearchServiceOptions) {
  const { researchId, teamId, plan, timeLimit } = options;
  console.log("Starting deep research");
  const startTime = Date.now();
  let currentTopic = options.topic;

  const logger = _logger.child({
    module: "deep-research",
    method: "performDeepResearch",
    researchId,
  });

  const researchState = {
    findings: [] as DeepResearchFinding[],
    summaries: [] as string[],
    nextSearchTopic: "",
    urlToSearch: "",
    currentDepth: 0,
    failedAttempts: 0,
    maxFailedAttempts: 3,
    completedSteps: 0,
    totalExpectedSteps: options.maxDepth * 5,
  };

  const addActivity = async (activity: DeepResearchActivity) => {
    if (activity.status === "complete") {
      researchState.completedSteps++;
    }

    await updateDeepResearch(researchId, {
      activities: [activity],
      completedSteps: researchState.completedSteps,
    });
  };

  const addSource = async (source: DeepResearchSource) => {
    await updateDeepResearch(researchId, {
      sources: [source],
    });
  };

  const analyzeAndPlan = async (
    findings: DeepResearchFinding[],
  ): Promise<AnalysisResult | null> => {
    try {
      const timeElapsed = Date.now() - startTime;
      const timeRemaining = timeLimit * 1000 - timeElapsed;
      const timeRemainingMinutes =
        Math.round((timeRemaining / 1000 / 60) * 10) / 10;

      const result = await generateText({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are an expert research agent that is analyzing findings. Your goal is to synthesize information and identify gaps for further research. Today's date is " +
              new Date().toISOString().split("T")[0],
          },
          {
            role: "user",
            content: truncateText(
              `You are researching: ${currentTopic}
            You have ${timeRemainingMinutes} minutes remaining to complete the research but you don't need to use all of it.
            Current findings: ${findings.map((f) => `[From ${f.source}]: ${f.text}`).join("\n")}
            What has been learned? What gaps remain? What specific aspects should be investigated next if any?
            If you need to search for more information, include a nextSearchTopic.
            If you need to search for more information in a specific URL, include a urlToSearch.
            Important: If less than 1 minute remains, set shouldContinue to false to allow time for final synthesis.
            If I have enough information, set shouldContinue to false.
            
            Respond in this exact JSON format:
            {
              "analysis": {
                "summary": "summary of findings",
                "gaps": ["gap1", "gap2"],
                "nextSteps": ["step1", "step2"],
                "shouldContinue": true/false,
                "nextSearchTopic": "optional topic",
                "urlToSearch": "optional url"
              }
            }`,
              120000,
            ),
          },
        ],
        temperature: 0.1,
      });

      try {
        const parsed = JSON.parse(result.text);
        return parsed.analysis;
      } catch (error) {
        logger.error("Failed to parse JSON response:", error);
        return null;
      }
    } catch (error) {
      logger.error("Analysis error:", error);
      return null;
    }
  };

  try {
    console.log("Starting research loop");
    console.log("Current depth", researchState.currentDepth);
    console.log("Max depth", options.maxDepth);
    while (researchState.currentDepth < options.maxDepth) {
      console.log("Current depth", researchState.currentDepth);
      const timeElapsed = Date.now() - startTime;
      if (timeElapsed >= timeLimit * 1000) {
        break;
      }

      researchState.currentDepth++;
      await updateDeepResearch(researchId, {
        currentDepth: researchState.currentDepth,
      });

      // Search phase
      await addActivity({
        type: "search",
        status: "pending",
        message: `Generating search queries for "${currentTopic}"`,
        timestamp: new Date().toISOString(),
        depth: researchState.currentDepth,
      });

      const searchQueries = (
        await generateSearchQueries(currentTopic, researchState.findings)
      ).slice(0, 3);

      // Log that we're starting multiple searches
      await addActivity({
        type: "search",
        status: "pending",
        message: `Starting ${searchQueries.length} parallel searches for "${currentTopic}"`,
        timestamp: new Date().toISOString(),
        depth: researchState.currentDepth,
      });

      console.log("Starting searches");
      console.log(searchQueries);

      // Run all searches in parallel
      const searchPromises = searchQueries.map(async (searchQuery) => {
        await addActivity({
          type: "search",
          status: "pending",
          message: `Searching for "${searchQuery.query}" - Goal: ${searchQuery.researchGoal}`,
          timestamp: new Date().toISOString(),
          depth: researchState.currentDepth,
        });

        const response = await searchAndScrapeSearchResult(searchQuery.query, {
          teamId: options.teamId,
          plan: options.plan as PlanType,
          origin: "deep-research",
          timeout: 30000,
          scrapeOptions: {
            formats: ["markdown"],
            onlyMainContent: true,
            waitFor: 0,
            mobile: false,
            parsePDF: false,
            useMock: "none",
            skipTlsVerification: false,
            removeBase64Images: false,
            fastMode: false,
            blockAds: false,
          },
        });
        if (response.length > 0) {
          return response;
        }
        return [];
      });

      // Wait for all searches to complete
      const searchResultsArrays = await Promise.all(searchPromises);

      // Flatten results array
      const searchResults = searchResultsArrays.flat();

      if (!searchResults || searchResults.length === 0) {
        await addActivity({
          type: "search",
          status: "error",
          message: `No results found for any queries about "${currentTopic}"`,
          timestamp: new Date().toISOString(),
          depth: researchState.currentDepth,
        });
        continue;
      }

      await addActivity({
        type: "search",
        status: "complete",
        message: `Found ${searchResults.length} relevant results across ${searchQueries.length} parallel queries`,
        timestamp: new Date().toISOString(),
        depth: researchState.currentDepth,
      });

      // Add sources from search results
      // await updateDeepResearch(researchId, {
      //   findings: searchResults.map((result) => ({
      //     text: result.markdown ?? "",
      //     source: result.url ?? "",
      //   })),
      // });

      researchState.findings = searchResults.map((result) => ({
        text: result.markdown ?? "",
        source: result.url ?? "",
      }));

      // Analysis phase
      await addActivity({
        type: "analyze",
        status: "pending",
        message: "Analyzing findings",
        timestamp: new Date().toISOString(),
        depth: researchState.currentDepth,
      });

      const analysis = await analyzeAndPlan(researchState.findings);

      if (!analysis) {
        await addActivity({
          type: "analyze",
          status: "error",
          message: "Failed to analyze findings",
          timestamp: new Date().toISOString(),
          depth: researchState.currentDepth,
        });

        researchState.failedAttempts++;
        if (researchState.failedAttempts >= researchState.maxFailedAttempts) {
          break;
        }
        continue;
      }

      researchState.nextSearchTopic = analysis.nextSearchTopic || "";
      researchState.urlToSearch = analysis.urlToSearch || "";
      researchState.summaries.push(analysis.summary);

      await updateDeepResearch(researchId, {
        summaries: [analysis.summary],
      });

      await addActivity({
        type: "analyze",
        status: "complete",
        message: analysis.summary,
        timestamp: new Date().toISOString(),
        depth: researchState.currentDepth,
      });

      if (!analysis.shouldContinue || analysis.gaps.length === 0) {
        break;
      }

      currentTopic = analysis.gaps[0] || currentTopic;
    }

    // Final synthesis
    await addActivity({
      type: "synthesis",
      status: "pending",
      message: "Preparing final analysis",
      timestamp: new Date().toISOString(),
      depth: researchState.currentDepth,
    });

    console.log("Final synthesis");

    const finalAnalysis = await generateText({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an expert research analyst who creates comprehensive, well-structured reports. Your reports are detailed, properly formatted in Markdown, and include clear sections with citations. Today's date is " +
            new Date().toISOString().split("T")[0],
        },
        {
          role: "user",
          content: truncateText(
            `Create a comprehensive research report on "${options.topic}" based on the collected findings and analysis.


Use this research data:
${researchState.findings.map((f) => `[From ${f.source}]: ${f.text}`).join("\n")}
${researchState.summaries.map((s) => `[Summary]: ${s}`).join("\n")}

Requirements:
- Format the report in Markdown with proper headers and sections
- Include specific citations to sources where appropriate
- Provide detailed analysis in each section
- Make it comprehensive and thorough (aim for 2+ pages worth of content)
- Include all relevant findings and insights from the research
- Use bullet points and lists where appropriate for readability`,
            120000,
          ),
        },
      ],
      temperature: 0.7,
    });

    await addActivity({
      type: "synthesis",
      status: "complete",
      message: "Research completed",
      timestamp: new Date().toISOString(),
      depth: researchState.currentDepth,
    });

    await updateDeepResearch(researchId, {
      status: "completed",
      finalAnalysis: finalAnalysis.text,
    });

    return {
      success: true,
      data: {
        findings: researchState.findings,
        finalAnalysis: finalAnalysis.text,
        analysis: finalAnalysis.text,
        completedSteps: researchState.completedSteps,
        totalSteps: researchState.totalExpectedSteps,
      },
    };
  } catch (error: any) {
    logger.error("Deep research error:", error);
    await updateDeepResearch(researchId, {
      status: "failed",
      error: error.message,
    });
    throw error;
  }
}
