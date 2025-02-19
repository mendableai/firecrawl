import { logger as _logger } from "../logger";
import { updateDeepResearch } from "./deep-research-redis";
import { PlanType } from "../../types";
import { searchAndScrapeSearchResult } from "../../controllers/v1/search";
import { ResearchLLMService, ResearchStateManager } from "./research-manager";
import { logJob } from "../../services/logging/log_job";
import { updateExtract } from "../extract/extract-redis";
import { billTeam } from "../../services/billing/credit_billing";

interface DeepResearchServiceOptions {
  researchId: string;
  teamId: string;
  plan: string;
  topic: string;
  maxDepth: number;
  timeLimit: number;
  subId?: string;
}

export async function performDeepResearch(options: DeepResearchServiceOptions) {
  const { researchId, teamId, plan, timeLimit, subId } = options;
  const startTime = Date.now();
  let currentTopic = options.topic;

  const logger = _logger.child({
    module: "deep-research",
    method: "performDeepResearch",
    researchId,
  });

  logger.debug("[Deep Research] Starting research with options:", { options });

  const state = new ResearchStateManager(
    researchId,
    teamId,
    plan,
    options.maxDepth,
    logger,
    options.topic,
  );
  const llmService = new ResearchLLMService(logger);

  try {
    while (!state.hasReachedMaxDepth()) {
      logger.debug("[Deep Research] Current depth:", state.getCurrentDepth());
      const timeElapsed = Date.now() - startTime;
      if (timeElapsed >= timeLimit * 1000) {
        logger.debug("[Deep Research] Time limit reached, stopping research");
        break;
      }

      await state.incrementDepth();

      // Search phase
      await state.addActivity({
        type: "search",
        status: "processing",
        message: `Generating search queries for "${currentTopic}"`,
        timestamp: new Date().toISOString(),
        depth: state.getCurrentDepth(),
      });

      const nextSearchTopic = state.getNextSearchTopic();
      logger.debug("[Deep Research] Next search topic:", { nextSearchTopic });

      const searchQueries = (
        await llmService.generateSearchQueries(
          nextSearchTopic,
          state.getFindings(),
        )
      ).slice(0, 3);

      logger.debug("[Deep Research] Generated search queries:", { searchQueries });

      await state.addActivity({
        type: "search",
        status: "processing",
        message: `Starting ${searchQueries.length} parallel searches for "${currentTopic}"`,
        timestamp: new Date().toISOString(),
        depth: state.getCurrentDepth(),
      });

      // Run all searches in parallel
      const searchPromises = searchQueries.map(async (searchQuery) => {
        await state.addActivity({
          type: "search",
          status: "processing",
          message: `Searching for "${searchQuery.query}" - Goal: ${searchQuery.researchGoal}`,
          timestamp: new Date().toISOString(),
          depth: state.getCurrentDepth(),
        });

        const response = await searchAndScrapeSearchResult(searchQuery.query, {
          teamId: options.teamId,
          plan: options.plan as PlanType,
          origin: "deep-research",
          timeout: 15000,
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

      logger.debug(
        "[Deep Research] Search results count:",
        { count: searchResults.length },
      );

      if (!searchResults || searchResults.length === 0) {
        logger.debug(
          "[Deep Research] No results found for topic:",
          { currentTopic },
        );
        await state.addActivity({
          type: "search",
          status: "error",
          message: `No results found for any queries about "${currentTopic}"`,
          timestamp: new Date().toISOString(),
          depth: state.getCurrentDepth(),
        });
        continue;
      }

      // Filter out already seen URLs and track new ones
      const newSearchResults = searchResults.filter((result) => {
        if (!result.url || state.hasSeenUrl(result.url)) {
          return false;
        }
        state.addSeenUrl(result.url);
        return true;
      });

      logger.debug(
        "[Deep Research] New unique results count:",
        { length: newSearchResults.length },
      );

      if (newSearchResults.length === 0) {
        logger.debug(
          "[Deep Research] No new unique results found for topic:",
          { currentTopic },
        );
        await state.addActivity({
          type: "search",
          status: "error",
          message: `Found ${searchResults.length} results but all URLs were already processed for "${currentTopic}"`,
          timestamp: new Date().toISOString(),
          depth: state.getCurrentDepth(),
        });
        continue;
      }

      await state.addActivity({
        type: "search",
        status: "complete",
        message: `Found ${newSearchResults.length} new relevant results across ${searchQueries.length} parallel queries`,
        timestamp: new Date().toISOString(),
        depth: state.getCurrentDepth(),
      });

      await state.addFindings(
        newSearchResults.map((result) => ({
          text: result.markdown ?? "",
          source: result.url ?? "",
        })),
      );

      // Analysis phase
      await state.addActivity({
        type: "analyze",
        status: "processing",
        message: "Analyzing findings",
        timestamp: new Date().toISOString(),
        depth: state.getCurrentDepth(),
      });

      const timeRemaining = timeLimit * 1000 - (Date.now() - startTime);
      logger.debug("[Deep Research] Time remaining (ms):", { timeRemaining });

      const analysis = await llmService.analyzeAndPlan(
        state.getFindings(),
        currentTopic,
        timeRemaining,
      );

      if (!analysis) {
        logger.debug("[Deep Research] Analysis failed");
        await state.addActivity({
          type: "analyze",
          status: "error",
          message: "Failed to analyze findings",
          timestamp: new Date().toISOString(),
          depth: state.getCurrentDepth(),
        });

        state.incrementFailedAttempts();
        if (state.hasReachedMaxFailedAttempts()) {
          logger.debug("[Deep Research] Max failed attempts reached");
          break;
        }
        continue;
      }

      logger.debug("[Deep Research] Analysis result:", {
        nextTopic: analysis.nextSearchTopic,
        shouldContinue: analysis.shouldContinue,
        gapsCount: analysis.gaps.length,
      });

      state.setNextSearchTopic(analysis.nextSearchTopic || "");

      await state.addActivity({
        type: "analyze",
        status: "complete",
        message: "Analyzed findings",
        timestamp: new Date().toISOString(),
        depth: state.getCurrentDepth(),
      });

      if (!analysis.shouldContinue || analysis.gaps.length === 0) {
        logger.debug("[Deep Research] No more gaps to research, ending search");
        break;
      }

      currentTopic = analysis.gaps[0] || currentTopic;
      logger.debug("[Deep Research] Next topic to research:", { currentTopic });
    }

    // Final synthesis
    logger.debug("[Deep Research] Starting final synthesis");
    await state.addActivity({
      type: "synthesis",
      status: "processing",
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

    const progress = state.getProgress();
    logger.debug("[Deep Research] Research completed successfully");

    // Log job with token usage and sources
    await logJob({
      job_id: researchId,
      success: true,
      message: "Research completed",
      num_docs: 1,
      docs: [{ finalAnalysis: finalAnalysis }],
      time_taken: (Date.now() - startTime) / 1000,
      team_id: teamId,
      mode: "deep-research",
      url: options.topic,
      scrapeOptions: options,
      origin: "api",
      num_tokens: 0,
      tokens_billed: 0,
      sources: {},
    });
    await updateDeepResearch(researchId, {
      status: "completed",
      finalAnalysis: finalAnalysis,
    });
    // Bill team for usage
    billTeam(teamId, subId, state.getFindings().length, logger).catch(
      (error) => {
        logger.error(
          `Failed to bill team ${teamId} for ${state.getFindings().length} findings`, { teamId, count: state.getFindings().length, error },
        );
      },
    );
    return {
      success: true,
      data: {
        finalAnalysis: finalAnalysis,
      },
    };
  } catch (error: any) {
    logger.error("Deep research error", { error });
    await updateDeepResearch(researchId, {
      status: "failed",
      error: error.message,
    });
    throw error;
  }
}
