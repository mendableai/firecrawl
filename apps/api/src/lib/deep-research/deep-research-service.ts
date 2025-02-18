import { logger as _logger } from "../logger";
import { DeepResearchActivity, DeepResearchFinding, DeepResearchSource, updateDeepResearch } from "./deep-research-redis";
import { generateText } from "../llm/generate";
import { searchController } from "../../controllers/v1/search";
import { extractController } from "../../controllers/v1/extract";
import { ExtractRequest, ExtractResponse, SearchResponse } from "../../controllers/v1/types";

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

interface MockResponse<T> {
  status: (code: number) => MockResponse<T>;
  json: (data: T) => T;
}

function createMockResponse<T>(): MockResponse<T> {
  return {
    status: () => mockResponse,
    json: (data: T) => data,
  };
}

const mockResponse = {
  status: function(this: any, code: number) { return this; },
  json: function<T>(data: T) { return data; },
};

export async function performDeepResearch(options: DeepResearchServiceOptions) {
  const { researchId, teamId, plan, topic, maxDepth, timeLimit } = options;
  const startTime = Date.now();
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
    totalExpectedSteps: maxDepth * 5,
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

  const analyzeAndPlan = async (findings: DeepResearchFinding[]): Promise<AnalysisResult | null> => {
    try {
      const timeElapsed = Date.now() - startTime;
      const timeRemaining = timeLimit * 1000 - timeElapsed;
      const timeRemainingMinutes = Math.round((timeRemaining / 1000 / 60) * 10) / 10;

      const result = await generateText({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: "You are a research agent analyzing findings. Your goal is to synthesize information and identify gaps for further research."
          },
          {
            role: "user",
            content: `You are researching: ${topic}
            You have ${timeRemainingMinutes} minutes remaining to complete the research but you don't need to use all of it.
            Current findings: ${findings.map((f) => `[From ${f.source}]: ${f.text}`).join('\n')}
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
            }`
          }
        ],
        temperature: 0.7,
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

  const extractFromUrls = async (urls: string[]) => {
    const extractPromises = urls.map(async (url) => {
      try {
        await addActivity({
          type: "extract",
          status: "pending",
          message: `Analyzing ${new URL(url).hostname}`,
          timestamp: new Date().toISOString(),
          depth: researchState.currentDepth,
        });

        const mockReq = {
          auth: { team_id: teamId, plan },
          body: {
            urls: [url],
            prompt: `Extract key information about ${topic}. Focus on facts, data, and expert opinions. Analysis should be full of details and very comprehensive.`,
          } as ExtractRequest,
        };

        const result = await extractController(mockReq as any, createMockResponse<ExtractResponse>()) as ExtractResponse;

        if (result.success) {
          await addActivity({
            type: "extract",
            status: "complete",
            message: `Extracted from ${new URL(url).hostname}`,
            timestamp: new Date().toISOString(),
            depth: researchState.currentDepth,
          });

          if (Array.isArray(result.data)) {
            return result.data.map((item) => ({
              text: item.data,
              source: url,
            }));
          }
          return [{ text: result.data, source: url }];
        }
        return [];
      } catch (error) {
        logger.error(`Extraction failed for ${url}:`, error);
        return [];
      }
    });

    const results = await Promise.all(extractPromises);
    return results.flat();
  };

  try {
    while (researchState.currentDepth < maxDepth) {
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
        message: `Searching for "${topic}"`,
        timestamp: new Date().toISOString(),
        depth: researchState.currentDepth,
      });

      let searchTopic = researchState.nextSearchTopic || topic;
      
      const mockReq = {
        auth: { team_id: teamId, plan },
        body: { query: searchTopic },
      };

      const searchResult = await searchController(mockReq as any, createMockResponse<SearchResponse>()) as SearchResponse;

      if (!searchResult.success) {
        await addActivity({
          type: "search",
          status: "error",
          message: `Search failed for "${searchTopic}"`,
          timestamp: new Date().toISOString(),
          depth: researchState.currentDepth,
        });

        researchState.failedAttempts++;
        if (researchState.failedAttempts >= researchState.maxFailedAttempts) {
          break;
        }
        continue;
      }

      await addActivity({
        type: "search",
        status: "complete",
        message: `Found ${searchResult.data.length} relevant results`,
        timestamp: new Date().toISOString(),
        depth: researchState.currentDepth,
      });

      // Add sources from search results
      for (const result of searchResult.data) {
        await addSource({
          url: result.url,
          title: result.title,
          description: result.description,
        });
      }

      // Extract phase
      const topUrls = searchResult.data
        .slice(0, 3)
        .map((result: any) => result.url);

      const newFindings = await extractFromUrls([
        researchState.urlToSearch,
        ...topUrls,
      ].filter(Boolean));
      
      researchState.findings.push(...newFindings);

      await updateDeepResearch(researchId, {
        findings: newFindings,
      });

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

      topic = analysis.gaps[0] || topic;
    }

    // Final synthesis
    await addActivity({
      type: "synthesis",
      status: "pending",
      message: "Preparing final analysis",
      timestamp: new Date().toISOString(),
      depth: researchState.currentDepth,
    });

    const finalAnalysis = await generateText({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: "You are a research synthesizer. Create a comprehensive analysis based on the provided findings and summaries."
        },
        {
          role: "user",
          content: `Create a comprehensive long analysis of ${topic} based on these findings:
          ${researchState.findings.map((f) => `[From ${f.source}]: ${f.text}`).join('\n')}
          ${researchState.summaries.map((s) => `[Summary]: ${s}`).join('\n')}
          Provide all the thoughts processes including findings details, key insights, conclusions, and any remaining uncertainties. Include citations to sources where appropriate. This analysis should be very comprehensive and full of details. It is expected to be very long, detailed and comprehensive.`
        }
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
        analysis: finalAnalysis.text,
        completedSteps: researchState.completedSteps,
        totalSteps: researchState.totalExpectedSteps,
      },
    };
  } catch (error: any) {
    logger.error("Deep research error:", error);

    await addActivity({
      type: "thought",
      status: "error",
      message: `Research failed: ${error.message}`,
      timestamp: new Date().toISOString(),
      depth: researchState.currentDepth,
    });

    throw error;
  }
} 