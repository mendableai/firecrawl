import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  markers: new Set<string>(),
  set: vi.fn(),
  del: vi.fn(),
  capturePostHog: vi.fn(),
  enabled: vi.fn(),
}));

vi.mock("../../services/rate-limiter", () => ({
  redisRateLimitClient: { set: mocks.set, del: mocks.del },
}));
vi.mock("../../services/posthog-capture", () => ({
  capturePostHog: mocks.capturePostHog,
  isPostHogCaptureEnabled: mocks.enabled,
}));

import {
  BILLING_LINK_SHOWN_EVENT,
  billingLinkDedupeKey,
  trackBillingLinkShown,
} from "../billing-link-analytics";

const ORG = "3f2c8a1e-5b7d-4c90-9e21-6a4b8d0f1c37";
const SHOWN = {
  orgId: ORG,
  surface: "mcp" as const,
  reason: "out_of_credits" as const,
  httpStatus: 402,
  tokenLink: true,
};

/** Let the fire-and-forget task run. */
const settle = () => new Promise(resolve => setImmediate(resolve));

beforeEach(() => {
  mocks.enabled.mockReturnValue(true);
  mocks.markers.clear();
  mocks.set.mockImplementation(async (key: string) => {
    if (mocks.markers.has(key)) return null;
    mocks.markers.add(key);
    return "OK";
  });
  mocks.del.mockImplementation(async (key: string) =>
    mocks.markers.delete(key) ? 1 : 0,
  );
  mocks.capturePostHog.mockResolvedValue(true);
  vi.useFakeTimers({
    now: new Date("2026-10-12T23:59:30.000Z"),
    toFake: ["Date"],
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("billingLinkDedupeKey", () => {
  it("keys on the UTC day, org, surface and reason", () => {
    expect(billingLinkDedupeKey(SHOWN)).toBe(
      `billing_link_shown:2026-10-12:${ORG}:mcp:out_of_credits`,
    );
    expect(
      billingLinkDedupeKey(SHOWN, new Date("2026-10-13T00:00:01.000Z")),
    ).toBe(`billing_link_shown:2026-10-13:${ORG}:mcp:out_of_credits`);
    expect(billingLinkDedupeKey({ ...SHOWN, reason: "low_credits" })).not.toBe(
      billingLinkDedupeKey(SHOWN),
    );
    expect(billingLinkDedupeKey({ ...SHOWN, surface: "cli" })).not.toBe(
      billingLinkDedupeKey(SHOWN),
    );
  });
});

describe("trackBillingLinkShown", () => {
  it("claims the day's marker with SET NX and a 25h TTL, then captures", async () => {
    trackBillingLinkShown(SHOWN);
    await settle();

    expect(mocks.set).toHaveBeenCalledExactlyOnceWith(
      `billing_link_shown:2026-10-12:${ORG}:mcp:out_of_credits`,
      "1",
      "EX",
      90000,
      "NX",
    );
    expect(mocks.capturePostHog).toHaveBeenCalledExactlyOnceWith(
      BILLING_LINK_SHOWN_EVENT,
      ORG,
      {
        org_id: ORG,
        surface: "mcp",
        reason: "out_of_credits",
        http_status: 402,
        link_type: "token",
        $process_person_profile: false,
      },
    );
  });

  it("labels a hint without a token as the fallback link", async () => {
    trackBillingLinkShown({
      ...SHOWN,
      reason: "low_credits",
      httpStatus: 200,
      tokenLink: false,
    });
    await settle();
    expect(mocks.capturePostHog).toHaveBeenCalledWith(
      BILLING_LINK_SHOWN_EVENT,
      ORG,
      expect.objectContaining({
        reason: "low_credits",
        http_status: 200,
        link_type: "fallback",
      }),
    );
  });

  it("does not capture again once the day's marker exists", async () => {
    trackBillingLinkShown(SHOWN);
    trackBillingLinkShown(SHOWN);
    await settle();
    expect(mocks.capturePostHog).toHaveBeenCalledTimes(1);
  });

  it("releases the marker when PostHog rejects the event, so the next hint retries", async () => {
    mocks.capturePostHog.mockResolvedValueOnce(false);
    trackBillingLinkShown(SHOWN);
    await settle();
    expect(mocks.markers.size).toBe(0);

    trackBillingLinkShown(SHOWN);
    await settle();
    expect(mocks.capturePostHog).toHaveBeenCalledTimes(2);
    expect(mocks.markers.has(billingLinkDedupeKey(SHOWN))).toBe(true);
  });

  it("spends no marker while capture is off", async () => {
    mocks.enabled.mockReturnValue(false);
    trackBillingLinkShown(SHOWN);
    await settle();
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.capturePostHog).not.toHaveBeenCalled();
  });

  it("returns before Redis answers and swallows a Redis failure", async () => {
    let fail!: (error: Error) => void;
    mocks.set.mockReturnValueOnce(
      new Promise((_, reject) => {
        fail = reject;
      }),
    );
    expect(trackBillingLinkShown(SHOWN)).toBeUndefined();
    fail(new Error("redis down"));
    await settle();
    expect(mocks.capturePostHog).not.toHaveBeenCalled();
  });
});
