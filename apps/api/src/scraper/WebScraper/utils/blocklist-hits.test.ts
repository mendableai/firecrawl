import { keylessTeamId, keylessTeamUuid } from "../../../lib/keyless-team";
import { initializeBlocklist, isUrlBlocked } from "./blocklist";

const insertedHits = vi.hoisted(() =>
  vi.fn(async (_hits: { team_id: string | null }[]) => {}),
);

vi.mock("../../../config", () => ({
  config: {
    USE_DB_AUTHENTICATION: true,
    DISABLE_BLOCKLIST: false,
  },
}));

vi.mock("../../../db/connection", () => ({
  db: {
    insert: vi.fn(() => ({ values: insertedHits })),
  },
  dbRr: {
    select: vi.fn(() => ({
      from: vi.fn(async () => [
        {
          org_id: null,
          data: { blocklist: ["facebook.com"], allowedKeywords: [] },
        },
      ]),
    })),
  },
}));

afterEach(() => vi.useRealTimers());

it("stores keyless hits under the caller's UUID and never writes a non-UUID team id", async () => {
  vi.useFakeTimers();
  await initializeBlocklist();
  const team = "5f0c2b1e-8d4a-4c3b-9e2f-1a2b3c4d5e6f";
  const keyless = keylessTeamId("203.0.113.7");

  for (const team_id of [team, keyless, "preview", null])
    expect(
      isUrlBlocked("https://facebook.com/page", null, {
        team_id,
        origin: "test",
      }),
    ).toBe(true);
  await vi.advanceTimersByTimeAsync(5000);

  // One batch carries every hit, so each team id must be a UUID or null.
  expect(insertedHits).toHaveBeenCalledOnce();
  expect(insertedHits.mock.calls[0][0].map(hit => hit.team_id)).toEqual([
    team,
    keylessTeamUuid(keyless),
    null,
    null,
  ]);
});
