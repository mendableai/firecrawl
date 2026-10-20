import { vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logRequest: vi.fn(),
  logResearchEndpoint: vi.fn(),
  fetchResearchUpstream: vi.fn(),
}));

vi.mock("../../../services/logging/log_job", () => ({
  logRequest: mocks.logRequest,
  logResearchEndpoint: mocks.logResearchEndpoint,
}));

vi.mock("../../../lib/research-upstream", () => ({
  fetchResearchUpstream: mocks.fetchResearchUpstream,
}));

vi.mock("../../../services/billing/credit_billing", () => ({
  billTeam: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../lib/keyless", () => ({
  chargeKeylessCredits: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

import { createDeveloperRouter, createResearchRouter } from "../research-proxy";
import { billTeam } from "../../../services/billing/credit_billing";
import { logger } from "../../../lib/logger";

const TEAM_ID = "11111111-1111-1111-1111-111111111111";
const flush = () => new Promise(resolve => setImmediate(resolve));

function routeHandler(router: any, path: string) {
  const layer = router.stack.find(
    (candidate: any) =>
      candidate.route?.path === path && candidate.route?.methods?.get,
  );
  return layer.route.stack.at(-1).handle;
}

function makeReq(
  query: Record<string, unknown>,
  flags: Record<string, unknown>,
) {
  return {
    method: "GET",
    query,
    params: {},
    body: {},
    headers: {},
    auth: { team_id: TEAM_ID },
    acuc: { api_key_id: 7, flags },
  } as any;
}

function makeRes() {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
    send: vi.fn(),
    end: vi.fn(),
    setHeader: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.send.mockReturnValue(res);
  return res;
}

async function callRoute(
  router: any,
  path: string,
  query: Record<string, unknown>,
  flags: Record<string, unknown>,
) {
  const res = makeRes();
  routeHandler(router, path)(makeReq(query, flags), res, vi.fn());
  await flush();
  return res;
}

async function dispatch(
  router: any,
  path: string,
  query: Record<string, unknown>,
  flags: Record<string, unknown>,
) {
  const req = { ...makeReq(query, flags), url: path };
  const res = makeRes();
  const next = vi.fn();
  router(req, res, next);
  await flush();
  return { res, next };
}

function expectRefused(res: any, next: any) {
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      success: false,
      error: expect.stringContaining("zero data retention"),
    }),
  );
  expect(next).not.toHaveBeenCalled();
  expect(mocks.fetchResearchUpstream).not.toHaveBeenCalled();
  expect(mocks.logRequest).not.toHaveBeenCalled();
  expect(mocks.logResearchEndpoint).not.toHaveBeenCalled();
  expect(billTeam).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.logRequest.mockResolvedValue(undefined);
  mocks.logResearchEndpoint.mockResolvedValue(undefined);
  mocks.fetchResearchUpstream.mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(),
    text: async () =>
      JSON.stringify({
        success: true,
        results: [{ id: "private-result", content: "private payload" }],
      }),
  });
});

describe.each([
  {
    name: "research paper search",
    router: () => createResearchRouter(),
    path: "/papers",
    query: { query: "private research query" },
  },
  {
    name: "developer search",
    router: () => createDeveloperRouter(),
    path: "/search",
    query: { query: "private code query" },
  },
])("standalone ZDR persistence for $name", testCase => {
  it.each([
    { searchZDR: "forced-zdr" },
    { searchZDR: "forced" },
    { forceZDR: true },
  ])("refuses a forced-ZDR team ahead of every route handler", async flags => {
    const { res, next } = await dispatch(
      testCase.router(),
      testCase.path,
      testCase.query,
      flags,
    );

    expectRefused(res, next);
  });

  it("marks forced-anon team payloads for redaction and cleanup", async () => {
    await callRoute(testCase.router(), testCase.path, testCase.query, {
      searchZDR: "forced-anon",
    });

    expect(mocks.logRequest).toHaveBeenCalledWith(
      expect.objectContaining({ zeroDataRetention: true }),
    );
    expect(mocks.logResearchEndpoint).toHaveBeenCalledWith(
      expect.objectContaining({ zeroDataRetention: true }),
    );
  });

  it("keeps normal retention for a team that may opt into ZDR", async () => {
    await callRoute(testCase.router(), testCase.path, testCase.query, {
      searchZDR: "allowed",
    });

    expect(mocks.logRequest).toHaveBeenCalledWith(
      expect.objectContaining({ zeroDataRetention: false }),
    );
    expect(mocks.logResearchEndpoint).toHaveBeenCalledWith(
      expect.objectContaining({ zeroDataRetention: false }),
    );
  });
});

describe("forced-ZDR refusal ordering", () => {
  it("refuses on the legacy research mount before its usage log line", async () => {
    const { res, next } = await dispatch(
      createResearchRouter({ legacy: true }),
      "/papers",
      { query: "private research query" },
      { searchZDR: "forced-zdr" },
    );

    expectRefused(res, next);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("refuses GitHub search before its deprecation notice and credit gate", async () => {
    const { res, next } = await dispatch(
      createResearchRouter(),
      "/github",
      { query: "private code query" },
      { searchZDR: "forced-zdr" },
    );

    expectRefused(res, next);
    expect(res.setHeader).not.toHaveBeenCalled();
  });
});
