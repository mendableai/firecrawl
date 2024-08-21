import { getJobPriority, addJobPriority, deleteJobPriority } from "../job-priority";
import { redisConnection } from "../../services/queue-service";
import { PlanType } from "../../types";

jest.mock("../../services/queue-service", () => ({
  redisConnection: {
    sadd: jest.fn(),
    srem: jest.fn(),
    scard: jest.fn(),
  },
}));

describe("Job Priority Tests", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("addJobPriority should add job_id to the set", async () => {
    const team_id = "team1";
    const job_id = "job1";
    await addJobPriority(team_id, job_id);
    expect(redisConnection.sadd).toHaveBeenCalledWith(`limit_team_id:${team_id}`, job_id);
  });

  test("deleteFromSet should remove job_id from the set", async () => {
    const team_id = "team1";
    const job_id = "job1";
    await deleteJobPriority(team_id, job_id);
    expect(redisConnection.srem).toHaveBeenCalledWith(`limit_team_id:${team_id}`, job_id);
  });

  test("getJobPriority should return correct priority based on plan and set length", async () => {
    const team_id = "team1";
    const plan: PlanType = "standard";
    (redisConnection.scard as jest.Mock).mockResolvedValue(150);

    const priority = await getJobPriority({ plan, team_id });
    expect(priority).toBe(10);

    (redisConnection.scard as jest.Mock).mockResolvedValue(250);
    const priorityExceeded = await getJobPriority({ plan, team_id });
    expect(priorityExceeded).toBe(20); // basePriority + Math.ceil((250 - 200) * 0.2)
  });

  test("getJobPriority should handle different plans correctly", async () => {
    const team_id = "team1";

    (redisConnection.scard as jest.Mock).mockResolvedValue(50);
    let plan: PlanType = "hobby";
    let priority = await getJobPriority({ plan, team_id });
    expect(priority).toBe(10);

    (redisConnection.scard as jest.Mock).mockResolvedValue(150);
    plan = "hobby";
    priority = await getJobPriority({ plan, team_id });
    expect(priority).toBe(35); // basePriority + Math.ceil((150 - 100) * 0.5)

    (redisConnection.scard as jest.Mock).mockResolvedValue(50);
    plan = "free";
    priority = await getJobPriority({ plan, team_id });
    expect(priority).toBe(10);

    (redisConnection.scard as jest.Mock).mockResolvedValue(60);
    plan = "free";
    priority = await getJobPriority({ plan, team_id });
    expect(priority).toBe(20); // basePriority + Math.ceil((60 - 50) * 1)
  });
});
