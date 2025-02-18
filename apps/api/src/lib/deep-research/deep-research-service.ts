import { logger as _logger } from "../logger";
import { updateDeepResearch } from "./deep-research-redis";
import { PlanType } from "../../types";
import { searchAndScrapeSearchResult } from "../../controllers/v1/search";
import { ResearchLLMService, ResearchStateManager } from "./research-manager";

interface DeepResearchServiceOptions {
  researchId: string;
  teamId: string;
  plan: string;
  topic: string;
  maxDepth: number;
  timeLimit: number;
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

  const state = new ResearchStateManager(
    researchId,
    teamId,
    plan,
    options.maxDepth,
    logger,
  );
  const llmService = new ResearchLLMService(logger);

  try {
    while (!state.hasReachedMaxDepth()) {
      const timeElapsed = Date.now() - startTime;
      if (timeElapsed >= timeLimit * 1000) {
        break;
      }

      await state.incrementDepth();

      // Search phase
      await state.addActivity({
        type: "search",
        status: "pending",
        message: `Generating search queries for "${currentTopic}"`,
        timestamp: new Date().toISOString(),
        depth: state.getCurrentDepth(),
      });

      const searchQueries = (
        await llmService.generateSearchQueries(
          currentTopic,
          state.getFindings(),
        )
      ).slice(0, 5);

      await state.addActivity({
        type: "search",
        status: "pending",
        message: `Starting ${searchQueries.length} parallel searches for "${currentTopic}"`,
        timestamp: new Date().toISOString(),
        depth: state.getCurrentDepth(),
      });

      // Run all searches in parallel
      const searchPromises = searchQueries.map(async (searchQuery) => {
        await state.addActivity({
          type: "search",
          status: "pending",
          message: `Searching for "${searchQuery.query}" - Goal: ${searchQuery.researchGoal}`,
          timestamp: new Date().toISOString(),
          depth: state.getCurrentDepth(),
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
        return response.length > 0 ? response : [];
      });

      const searchResultsArrays = await Promise.all(searchPromises);
      const searchResults = searchResultsArrays.flat();

      if (!searchResults || searchResults.length === 0) {
        await state.addActivity({
          type: "search",
          status: "error",
          message: `No results found for any queries about "${currentTopic}"`,
          timestamp: new Date().toISOString(),
          depth: state.getCurrentDepth(),
        });
        continue;
      }

      await state.addActivity({
        type: "search",
        status: "complete",
        message: `Found ${searchResults.length} relevant results across ${searchQueries.length} parallel queries`,
        timestamp: new Date().toISOString(),
        depth: state.getCurrentDepth(),
      });

      await state.addFindings(
        searchResults.map((result) => ({
          text: result.markdown ?? "",
          source: result.url ?? "",
        })),
      );

      // Analysis phase
      await state.addActivity({
        type: "analyze",
        status: "pending",
        message: "Analyzing findings",
        timestamp: new Date().toISOString(),
        depth: state.getCurrentDepth(),
      });

      const timeRemaining = timeLimit * 1000 - (Date.now() - startTime);
      const analysis = await llmService.analyzeAndPlan(
        state.getFindings(),
        currentTopic,
        timeRemaining,
      );

      if (!analysis) {
        await state.addActivity({
          type: "analyze",
          status: "error",
          message: "Failed to analyze findings",
          timestamp: new Date().toISOString(),
          depth: state.getCurrentDepth(),
        });

        state.incrementFailedAttempts();
        if (state.hasReachedMaxFailedAttempts()) {
          break;
        }
        continue;
      }

      state.setNextSearchTopic(analysis.nextSearchTopic || "");
      state.setUrlToSearch(analysis.urlToSearch || "");
      await state.addSummary(analysis.summary);

      await state.addActivity({
        type: "analyze",
        status: "complete",
        message: analysis.summary,
        timestamp: new Date().toISOString(),
        depth: state.getCurrentDepth(),
      });

      if (!analysis.shouldContinue || analysis.gaps.length === 0) {
        break;
      }

      currentTopic = analysis.gaps[0] || currentTopic;
    }

    // Final synthesis
    await state.addActivity({
      type: "synthesis",
      status: "pending",
      message: "Preparing final analysis",
      timestamp: new Date().toISOString(),
      depth: state.getCurrentDepth(),
    });

    const finalAnalysis = await llmService.generateFinalAnalysis(
      options.topic,
      state.getFindings(),
      state.getSummaries(),
    );

    await state.addActivity({
      type: "synthesis",
      status: "complete",
      message: "Research completed",
      timestamp: new Date().toISOString(),
      depth: state.getCurrentDepth(),
    });

    await updateDeepResearch(researchId, {
      status: "completed",
      finalAnalysis: finalAnalysis,
    });

    const progress = state.getProgress();
    return {
      success: true,
      data: {
        findings: state.getFindings(),
        finalAnalysis: finalAnalysis,
        analysis: finalAnalysis,
        completedSteps: progress.completedSteps,
        totalSteps: progress.totalSteps,
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
