import { performDeepResearch } from '../../../lib/deep-research/deep-research-service';
import { ResearchLLMService, ResearchStateManager } from '../../../lib/deep-research/research-manager';
import { searchAndScrapeSearchResult } from '../../../controllers/v1/search';
import { getACUCTeam } from '../../../controllers/auth';

jest.mock('../../../lib/deep-research/research-manager');
jest.mock('../../../controllers/v1/search');
jest.mock('../../../controllers/auth');
jest.mock('../../../lib/deep-research/deep-research-redis', () => ({
  updateDeepResearch: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../../services/logging/log_job', () => ({
  logJob: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../../services/billing/credit_billing', () => ({
  billTeam: jest.fn().mockResolvedValue(true),
}));

describe('Deep Research Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    (ResearchStateManager as jest.Mock).mockImplementation(() => ({
      hasReachedMaxDepth: jest.fn().mockReturnValue(false),
      getCurrentDepth: jest.fn().mockReturnValue(1),
      incrementDepth: jest.fn().mockResolvedValue(true),
      addActivity: jest.fn().mockResolvedValue(true),
      getNextSearchTopic: jest.fn().mockReturnValue('test topic'),
      getFindings: jest.fn().mockReturnValue([]),
      hasSeenUrl: jest.fn().mockReturnValue(false),
      addSeenUrl: jest.fn().mockReturnValue(true),
      addSources: jest.fn().mockResolvedValue(true),
      addFindings: jest.fn().mockResolvedValue(true),
      setNextSearchTopic: jest.fn().mockReturnValue(true),
      incrementFailedAttempts: jest.fn().mockReturnValue(true),
      hasReachedMaxFailedAttempts: jest.fn().mockReturnValue(false),
      getSummaries: jest.fn().mockReturnValue([]),
      getSources: jest.fn().mockReturnValue([]),
      getProgress: jest.fn().mockReturnValue({}),
    }));
    
    (ResearchLLMService as jest.Mock).mockImplementation(() => ({
      generateSearchQueries: jest.fn().mockResolvedValue([
        { query: 'test query 1', researchGoal: 'test goal 1' },
        { query: 'test query 2', researchGoal: 'test goal 2' },
      ]),
      analyzeAndPlan: jest.fn().mockResolvedValue({
        nextSearchTopic: 'next topic',
        shouldContinue: true,
        gaps: ['gap 1', 'gap 2'],
      }),
      generateFinalAnalysis: jest.fn().mockResolvedValue('final analysis'),
    }));
    
    (searchAndScrapeSearchResult as jest.Mock).mockResolvedValue([
      { url: 'https://test1.com', title: 'Test 1', description: 'Test desc 1', markdown: 'Test content 1', metadata: { favicon: 'icon1' } },
      { url: 'https://test2.com', title: 'Test 2', description: 'Test desc 2', markdown: 'Test content 2', metadata: { favicon: 'icon2' } },
    ]);
    
    (getACUCTeam as jest.Mock).mockResolvedValue({ flags: {} });
    
    jest.spyOn(Date, 'now').mockImplementation(() => 1000);
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  test('should respect maxUrls parameter', async () => {
    const nowMock = jest.spyOn(Date, 'now');
    let currentTime = 1000;
    nowMock.mockImplementation(() => currentTime);
    
    (searchAndScrapeSearchResult as jest.Mock).mockResolvedValue(Array(10).fill(0).map((_, i) => ({
      url: `https://test${i}.com`,
      title: `Test ${i}`,
      description: `Test desc ${i}`,
      markdown: `Test content ${i}`,
      metadata: { favicon: `icon${i}` },
    })));
    
    const options = {
      researchId: 'test-id',
      teamId: 'team-id',
      query: 'test query',
      maxDepth: 3,
      maxUrls: 5, // Set max URLs to 5
      timeLimit: 300,
      analysisPrompt: 'test prompt',
      systemPrompt: 'test system prompt',
      formats: ['markdown'],
      jsonOptions: {},
    };
    
    await performDeepResearch(options);
    
    const billTeamMock = require('../../../services/billing/credit_billing').billTeam;
    expect(billTeamMock).toHaveBeenCalledWith('team-id', undefined, 5, expect.anything());
  });
  
  test('should respect timeLimit parameter', async () => {
    const nowMock = jest.spyOn(Date, 'now');
    let currentTime = 1000;
    nowMock.mockImplementation(() => {
      currentTime += 100000;
      return currentTime;
    });
    
    const options = {
      researchId: 'test-id',
      teamId: 'team-id',
      query: 'test query',
      maxDepth: 3,
      maxUrls: 50,
      timeLimit: 180, // 3 minutes
      analysisPrompt: 'test prompt',
      systemPrompt: 'test system prompt',
      formats: ['markdown'],
      jsonOptions: {},
    };
    
    await performDeepResearch(options);
    
    const logJobMock = require('../../../services/logging/log_job').logJob;
    expect(logJobMock).toHaveBeenCalled();
    
    const logJobCall = logJobMock.mock.calls[0][0];
    expect(logJobCall.time_taken).toBeLessThanOrEqual(options.timeLimit);
  });
});
