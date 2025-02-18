import { Logger } from "winston";
import {
  DeepResearchActivity,
  DeepResearchFinding,
  DeepResearchSource,
  updateDeepResearch,
} from "./deep-research-redis";
import { generateOpenAICompletions } from "../../scraper/scrapeURL/transformers/llmExtract";
import { truncateText } from "../../scraper/scrapeURL/transformers/llmExtract";

interface AnalysisResult {
  summary: string;
  gaps: string[];
  nextSteps: string[];
  shouldContinue: boolean;
  nextSearchTopic?: string;
  urlToSearch?: string;
}
export class ResearchStateManager {
  private findings: DeepResearchFinding[] = [];
  private summaries: string[] = [];
  private nextSearchTopic: string = "";
  private urlToSearch: string = "";
  private currentDepth: number = 0;
  private failedAttempts: number = 0;
  private readonly maxFailedAttempts: number = 3;
  private completedSteps: number = 0;
  private readonly totalExpectedSteps: number;

  constructor(
    private readonly researchId: string,
    private readonly teamId: string,
    private readonly plan: string,
    private readonly maxDepth: number,
    private readonly logger: Logger,
  ) {
    this.totalExpectedSteps = maxDepth * 5; // 5 steps per depth level
  }

  async addActivity(activity: DeepResearchActivity): Promise<void> {
    if (activity.status === "complete") {
      this.completedSteps++;
    }

    await updateDeepResearch(this.researchId, {
      activities: [activity],
      completedSteps: this.completedSteps,
    });
  }

  async addSource(source: DeepResearchSource): Promise<void> {
    await updateDeepResearch(this.researchId, {
      sources: [source],
    });
  }

  async addFindings(findings: DeepResearchFinding[]): Promise<void> {
    this.findings = [...this.findings, ...findings];
    await updateDeepResearch(this.researchId, {
      findings: findings,
    });
  }

  async addSummary(summary: string): Promise<void> {
    this.summaries.push(summary);
    await updateDeepResearch(this.researchId, {
      summaries: [summary],
    });
  }

  async incrementDepth(): Promise<void> {
    this.currentDepth++;
    await updateDeepResearch(this.researchId, {
      currentDepth: this.currentDepth,
    });
  }

  incrementFailedAttempts(): void {
    this.failedAttempts++;
  }

  getFindings(): DeepResearchFinding[] {
    return this.findings;
  }

  getSummaries(): string[] {
    return this.summaries;
  }

  getCurrentDepth(): number {
    return this.currentDepth;
  }

  hasReachedMaxDepth(): boolean {
    return this.currentDepth >= this.maxDepth;
  }

  hasReachedMaxFailedAttempts(): boolean {
    return this.failedAttempts >= this.maxFailedAttempts;
  }

  getProgress(): { completedSteps: number; totalSteps: number } {
    return {
      completedSteps: this.completedSteps,
      totalSteps: this.totalExpectedSteps,
    };
  }

  setNextSearchTopic(topic: string): void {
    this.nextSearchTopic = topic;
  }

  getNextSearchTopic(): string {
    return this.nextSearchTopic;
  }

  setUrlToSearch(url: string): void {
    this.urlToSearch = url;
  }

  getUrlToSearch(): string {
    return this.urlToSearch;
  }
}

export class ResearchLLMService {
  constructor(private readonly logger: Logger) {}

  async generateSearchQueries(
    topic: string,
    findings: DeepResearchFinding[] = [],
  ): Promise<{ query: string; researchGoal: string }[]> {
    const { extract } = await generateOpenAICompletions(
      this.logger.child({
        method: "generateSearchQueries",
      }),
      {
        mode: "llm",
        systemPrompt:
          "You are an expert research agent that generates search queries (SERP) to explore topics deeply and thoroughly. Do not generate repeated queries. Today's date is " +
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
          ${findings.length > 0 ? `\nBased on these previous findings, generate more specific queries:\n${truncateText(findings.map((f) => `- ${f.text}`).join("\n"), 10000)}` : ""}
          
          Each query should be specific and focused on a particular aspect.
          Build upon previous findings when available.
          Every search query is a new SERP query so make sure the whole context is added without overwhelming the search engine.
          
          The first SERP query you generate should be a very concise, simple version of the topic. 

          If applicable, return queries that will help uncover different aspects and perspectives of the topic - always following the users intent. Include the topic on the queries.`,
      },
      "",
      undefined,
      true,
    );

    return extract.queries;
  }

  async analyzeAndPlan(
    findings: DeepResearchFinding[],
    currentTopic: string,
    timeRemaining: number,
  ): Promise<AnalysisResult | null> {
    try {
      const timeRemainingMinutes =
        Math.round((timeRemaining / 1000 / 60) * 10) / 10;

      const { extract } = await generateOpenAICompletions(
        this.logger.child({
          method: "analyzeAndPlan",
        }),
        {
          mode: "llm",
          systemPrompt:
            "You are an expert research agent that is analyzing findings. Your goal is to synthesize information and identify gaps for further research. Today's date is " +
            new Date().toISOString().split("T")[0],
          schema: {
            type: "object",
            properties: {
              analysis: {
                type: "object",
                properties: {
                  summary: { type: "string" },
                  gaps: { type: "array", items: { type: "string" } },
                  nextSteps: { type: "array", items: { type: "string" } },
                  shouldContinue: { type: "boolean" },
                  nextSearchTopic: { type: "string" },
                  urlToSearch: { type: "string" },
                },
                required: ["summary", "gaps", "nextSteps", "shouldContinue"],
              },
            },
          },
          prompt: truncateText(
            `You are researching: ${currentTopic}
              You have ${timeRemainingMinutes} minutes remaining to complete the research but you don't need to use all of it.
              Current findings: ${findings.map((f) => `[From ${f.source}]: ${f.text}`).join("\n")}
              What has been learned? What gaps remain, if any? What specific aspects should be investigated next if any?
              If you need to search for more information, include a nextSearchTopic.
              If you need to search for more information in a specific URL, include a urlToSearch.
              Important: If less than 1 minute remains, set shouldContinue to false to allow time for final synthesis.
              If I have enough information, set shouldContinue to false.`,
            120000,
          ),
        },
        "",
        undefined,
        true,
      );

      return extract.analysis;
    } catch (error) {
      this.logger.error("Analysis error:", error);
      return null;
    }
  }

  async generateFinalAnalysis(
    topic: string,
    findings: DeepResearchFinding[],
    summaries: string[],
  ): Promise<string> {
    const { extract } = await generateOpenAICompletions(
      this.logger.child({
        method: "generateFinalAnalysis",
      }),
      {
        mode: "llm",
        systemPrompt:
          "You are an expert research analyst who creates comprehensive, well-structured reports. Your reports are detailed, properly formatted in Markdown, and include clear sections with citations. Today's date is " +
          new Date().toISOString().split("T")[0],
        schema: {
          type: "object",
          properties: {
            report: { type: "string" },
          },
        },
        prompt: truncateText(
          `Create a comprehensive research report on "${topic}" based on the collected findings and analysis.
  
            Research data:
            ${findings.map((f) => `[From ${f.source}]: ${f.text}`).join("\n")}
            ${summaries.map((s) => `[Summary]: ${s}`).join("\n")}
  
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
      "",
      undefined,
      true,
    );

    return extract.report;
  }
}
