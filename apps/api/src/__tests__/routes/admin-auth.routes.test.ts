import express from "express";
import request from "supertest";
import { config } from "../../config";
import { adminAuth } from "../../lib/admin-auth";
import { logger } from "../../lib/logger";

const CURRENT = "current-admin-key-0001";
const PREVIOUS = "previous-admin-key-0002";

function matchedKeys(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls
    .map(call => (call[1] as { matchedKey?: string } | undefined)?.matchedKey)
    .filter(Boolean);
}

function appWithAdminAuth() {
  const app = express();
  const ops = express.Router();
  ops.use(adminAuth);
  ops.get("/redis-health", (_req, res) => res.status(200).json({ ok: true }));
  app.use("/admin/ops", ops);
  return app;
}

describe("adminAuth", () => {
  const original = {
    BULL_AUTH_KEY: config.BULL_AUTH_KEY,
    BULL_AUTH_KEY_PREVIOUS: config.BULL_AUTH_KEY_PREVIOUS,
  };

  beforeEach(() => {
    config.BULL_AUTH_KEY = CURRENT;
    config.BULL_AUTH_KEY_PREVIOUS = undefined;
  });

  afterEach(() => {
    config.BULL_AUTH_KEY = original.BULL_AUTH_KEY;
    config.BULL_AUTH_KEY_PREVIOUS = original.BULL_AUTH_KEY_PREVIOUS;
    vi.restoreAllMocks();
  });

  it("accepts the current key and logs which key matched", async () => {
    const info = vi.spyOn(logger, "info");

    const response = await request(appWithAdminAuth())
      .get("/admin/ops/redis-health")
      .set("Authorization", `Bearer ${CURRENT}`);

    expect(response.status).toBe(200);
    expect(matchedKeys(info)).toEqual(["current"]);
    expect(JSON.stringify(info.mock.calls)).not.toContain(CURRENT);
  });

  it("accepts the previous key when it is set", async () => {
    config.BULL_AUTH_KEY_PREVIOUS = PREVIOUS;
    const info = vi.spyOn(logger, "info");

    const response = await request(appWithAdminAuth())
      .get("/admin/ops/redis-health")
      .set("Authorization", `Bearer ${PREVIOUS}`);

    expect(response.status).toBe(200);
    expect(matchedKeys(info)).toEqual(["previous"]);
    expect(JSON.stringify(info.mock.calls)).not.toContain(PREVIOUS);
  });

  it("rejects the previous key once it is cleared", async () => {
    const response = await request(appWithAdminAuth())
      .get("/admin/ops/redis-health")
      .set("Authorization", `Bearer ${PREVIOUS}`);

    expect(response.status).toBe(401);
  });

  it("rejects a missing, malformed, wrong or wrong-length key", async () => {
    const app = appWithAdminAuth();
    const headers = [
      undefined,
      CURRENT,
      `Basic ${CURRENT}`,
      "Bearer ",
      `Bearer ${CURRENT.slice(0, -1)}x`,
      `Bearer ${CURRENT}extra`,
    ];

    for (const header of headers) {
      const req = request(app).get("/admin/ops/redis-health");
      const response = await (header ? req.set("Authorization", header) : req);
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ success: false, error: "Unauthorized" });
    }
  });

  it("does not expose the key in the URL path", async () => {
    const response = await request(appWithAdminAuth()).get(
      `/admin/ops/${CURRENT}/redis-health`,
    );

    expect(response.status).toBe(401);
  });
});
