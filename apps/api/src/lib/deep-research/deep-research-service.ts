import { logger as _logger } from "../logger";
import { DeepResearchActivity, DeepResearchFinding, DeepResearchSource, updateDeepResearch } from "./deep-research-redis";
import { generateText } from "../llm/generate";
import { search } from "../../search";
import { performExtraction } from "../extract/extraction-service";
import { ExtractRequest, ExtractResponse, SearchResponse } from "../../controllers/v1/types";
import { Response } from "express";
import { PlanType } from "../../types";

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


export async function performDeepResearch(options: DeepResearchServiceOptions) {
  const { researchId, teamId, plan, timeLimit } = options;
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

  const analyzeAndPlan = async (findings: DeepResearchFinding[]): Promise<AnalysisResult | null> => {
    try {
      const timeElapsed = Date.now() - startTime;
      const timeRemaining = timeLimit * 1000 - timeElapsed;
      const timeRemainingMinutes = Math.round((timeRemaining / 1000 / 60) * 10) / 10;

      const result = await generateText({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a research agent analyzing findings. Your goal is to synthesize information and identify gaps for further research."
          },
          {
            role: "user",
            content: `You are researching: ${currentTopic}
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

  try {
    while (researchState.currentDepth < options.maxDepth) {
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
        message: `Searching for "${currentTopic}"`,
        timestamp: new Date().toISOString(),
        depth: researchState.currentDepth,
      });

      const searchTopic = researchState.nextSearchTopic || currentTopic;
      
      // Direct integration with search service
      const searchResults = await search({
        query: searchTopic,
        advanced: false,
        num_results: 5,
        lang: "en",
        country: "us"
      });

      if (!searchResults || searchResults.length === 0) {
        await addActivity({
          type: "search",
          status: "error",
          message: `No results found for "${searchTopic}"`,
          timestamp: new Date().toISOString(),
          depth: researchState.currentDepth,
        });
        continue;
      }

      await addActivity({
        type: "search",
        status: "complete",
        message: `Found ${searchResults.length} relevant results`,
        timestamp: new Date().toISOString(),
        depth: researchState.currentDepth,
      });

      // Add sources from search results
      for (const result of searchResults) {
        await updateDeepResearch(researchId, {
          sources: [{
            url: result.url,
            title: result.title,
            description: result.description,
          }]
        });
      }

      // Extract phase using the extraction service
      const extractResult = await performExtraction(researchId, {
        request: {
          urls: [
            ...(researchState.urlToSearch ? [researchState.urlToSearch] : []),
            ...searchResults.slice(0, 3).map(r => r.url)
          ],
          prompt: `Extract key information about ${currentTopic}. Focus on facts, data, and expert opinions.`,
          schema: {
            type: "object",
            properties: {
              relevantInformation: {
                type: "string",
                description: "The relevant information about the topic from this source"
              }
            },
            required: ["relevantInformation"]
          },
          showSources: true,
          allowExternalLinks: false,
          ignoreSitemap: true,
          includeSubdomains: false,
          enableWebSearch: false,
          timeout: 60000,
          origin: "deep-research",
          urlTrace: false,
          __experimental_streamSteps: false,
          __experimental_llmUsage: false,
          __experimental_showSources: true,
          __experimental_cacheMode: "direct"
        },
        teamId,
        plan: plan as PlanType,
      });

      if (extractResult.success && extractResult.data) {
        interface ExtractionData {
          relevantInformation: string;
        }
        
        const newFindings = Object.entries(extractResult.data).map(([_, value]) => ({
          text: (value as ExtractionData).relevantInformation,
          source: extractResult.sources?.[(value as ExtractionData).relevantInformation]?.[0] || "unknown"
        }));

        researchState.findings.push(...newFindings);
        await updateDeepResearch(researchId, {
          findings: newFindings
        });
      }

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

    const finalAnalysis = await generateText({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a research synthesizer. Create a comprehensive analysis based on the provided findings and summaries."
        },
        {
          role: "user",
          content: `Create a comprehensive long analysis of ${currentTopic} based on these findings:
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
    await updateDeepResearch(researchId, {
      status: "failed",
      error: error.message
    });
    throw error;
  }
} 