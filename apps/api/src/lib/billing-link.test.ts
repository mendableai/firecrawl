import { config } from "../config";
import {
  billingFallbackUrl,
  billingLink,
  decryptBillingLinkToken,
  encryptBillingLinkToken,
  type BillingLinkReason,
} from "./billing-link";
import type { KeylessSignupSurface } from "./keyless-signup-link";

// Shared with firecrawl-web lib/billing-link.test.ts: both repos must produce
// and accept exactly these tokens for this key and payload.
const CROSS_REPO_KEY = "AAECAwQFBgcICQoLDA0ODw==";
const CROSS_REPO_ORG = "3f2c8a1e-5b7d-4c90-9e21-6a4b8d0f1c37";
const CROSS_REPO_TOKENS = {
  out_of_credits: "vrjqes19bwvsjm86fprvnjxhve0ry5r2",
  low_credits: "3npvx9qjwnah0fepvcfb54e5vrs69xa3",
} as const;

const KEY = Buffer.from(CROSS_REPO_KEY, "base64");
const OTHER_KEY = Buffer.alloc(16, 7);
const TOKEN_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

describe("billing link token", () => {
  const original = config.BILLING_LINK_KEYS;

  afterEach(() => {
    config.BILLING_LINK_KEYS = original;
  });

  it.each(Object.entries(CROSS_REPO_TOKENS))(
    "matches the cross-repo vector for %s",
    (reason, token) => {
      const payload = {
        orgId: CROSS_REPO_ORG,
        surface: "mcp" as const,
        reason: reason as BillingLinkReason,
      };
      expect(encryptBillingLinkToken(payload, KEY)).toBe(token);
      expect(decryptBillingLinkToken(token, [KEY])).toEqual(payload);
    },
  );

  const surfaces: KeylessSignupSurface[] = ["api", "mcp", "cli"];
  const reasons: BillingLinkReason[] = ["out_of_credits", "low_credits"];
  it.each(
    surfaces.flatMap(surface => reasons.map(reason => [surface, reason])),
  )("round-trips surface %s and reason %s", (surface, reason) => {
    const payload = {
      orgId: "ffffffff-0000-4000-8000-00000000abcd",
      surface: surface as KeylessSignupSurface,
      reason: reason as BillingLinkReason,
    };
    const token = encryptBillingLinkToken(payload, KEY)!;
    expect(token).toMatch(/^[0-9abcdefghjkmnpqrstvwxyz]{32}$/);
    expect(decryptBillingLinkToken(token, [KEY])).toEqual(payload);
  });

  it("normalises the org id to lowercase and rejects non-uuids", () => {
    const token = encryptBillingLinkToken(
      {
        orgId: CROSS_REPO_ORG.toUpperCase(),
        surface: "mcp",
        reason: "low_credits",
      },
      KEY,
    );
    expect(token).toBe(CROSS_REPO_TOKENS.low_credits);
    for (const orgId of ["", "org_123", `${CROSS_REPO_ORG}0`, "not-a-uuid"]) {
      expect(
        encryptBillingLinkToken(
          { orgId, surface: "api", reason: "low_credits" },
          KEY,
        ),
      ).toBeUndefined();
    }
  });

  it("rejects malformed tokens, other keys and single-character edits", () => {
    const token = CROSS_REPO_TOKENS.out_of_credits;
    expect(decryptBillingLinkToken(token, [OTHER_KEY])).toBeNull();
    expect(decryptBillingLinkToken(token.toUpperCase(), [KEY])).toBeNull();
    expect(decryptBillingLinkToken(token.slice(1), [KEY])).toBeNull();
    expect(decryptBillingLinkToken(`${token}0`, [KEY])).toBeNull();
    expect(decryptBillingLinkToken(token.replace(/.$/, "u"), [KEY])).toBeNull();
    for (let i = 0; i < token.length; i++) {
      const swapped =
        TOKEN_ALPHABET[(TOKEN_ALPHABET.indexOf(token[i]) + 1) % 32];
      expect(
        decryptBillingLinkToken(
          token.slice(0, i) + swapped + token.slice(i + 1),
          [KEY],
        ),
      ).toBeNull();
    }
  });

  it("accepts no random token out of 20,000", () => {
    let seed = 20261012;
    const next = () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return seed >>> 27;
    };
    for (let i = 0; i < 20_000; i++) {
      const token = Array.from(
        { length: 32 },
        () => TOKEN_ALPHABET[next()],
      ).join("");
      expect(decryptBillingLinkToken(token, [KEY])).toBeNull();
    }
  });

  it("decrypts with a rotated-out key while it stays listed", () => {
    const token = encryptBillingLinkToken(
      { orgId: CROSS_REPO_ORG, surface: "cli", reason: "low_credits" },
      OTHER_KEY,
    )!;
    config.BILLING_LINK_KEYS = `${CROSS_REPO_KEY}, ${OTHER_KEY.toString("base64")}`;
    expect(decryptBillingLinkToken(token)).toMatchObject({
      orgId: CROSS_REPO_ORG,
    });
    config.BILLING_LINK_KEYS = CROSS_REPO_KEY;
    expect(decryptBillingLinkToken(token)).toBeNull();
  });

  it("links with the first configured key", () => {
    config.BILLING_LINK_KEYS = `${CROSS_REPO_KEY},${OTHER_KEY.toString("base64")}`;
    expect(billingLink(CROSS_REPO_ORG, "mcp", "out_of_credits")).toBe(
      `https://www.firecrawl.dev/billing/${CROSS_REPO_TOKENS.out_of_credits}`,
    );
  });

  it("falls back to billing settings with attribution without a key or uuid", () => {
    config.BILLING_LINK_KEYS = undefined;
    expect(billingLink(CROSS_REPO_ORG, "cli", "out_of_credits")).toBe(
      "https://www.firecrawl.dev/app/settings?tab=billing&utm_source=agent_hints&utm_medium=cli&utm_campaign=out_of_credits",
    );
    config.BILLING_LINK_KEYS = CROSS_REPO_KEY;
    expect(billingLink("org_legacy", "api", "low_credits")).toBe(
      billingFallbackUrl("api", "low_credits"),
    );
  });
});
