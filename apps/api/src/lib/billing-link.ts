import { config } from "../config";
import { ff1Decrypt, ff1Encrypt } from "./keyless-signup-link";
import type { KeylessSignupSurface } from "./keyless-signup-link";
import { logger } from "./logger";

// Credit guidance links to the account's billing settings at
// https://www.firecrawl.dev/billing/<token>. The token carries the org, the
// surface and the reason, encrypted: nothing is stored per link, and the web
// app decrypts it to open that org's billing for a signed-in member.
//
// Token format. Keep identical to firecrawl-web lib/billing-link.ts.
//   Plaintext: a 160-bit integer, most significant bits first:
//     bits 159..32  org id (the uuid's 16 bytes, big-endian)
//     bits 31..30   surface: 0 api, 1 mcp, 2 cli (3 reserved)
//     bits 29..27   reason: 0 out_of_credits, 1 low_credits (2..7 reserved)
//     bits 26..0    check: always zero
//   Written as 32 radix-32 numerals (5 bits each, most significant first) and
//   encrypted with NIST SP 800-38G FF1 over AES-128, radix 32, tweak the ASCII
//   bytes "fc-billing-v1". The 32 output numerals are spelled in lowercase
//   Crockford base32 (0123456789abcdefghjkmnpqrstvwxyz).
//   A token is valid only if the 27 check bits decrypt to zero, so a forged or
//   mistyped token passes with odds of about 1 in 134 million per key.
//   Reserved surface or reason codes decode to null (a newer issuer).
//   Tokens do not expire, like keyless signup tokens: the web app only opens an
//   org's billing after checking membership, and removing a key revokes every
//   token made with it.
//
// Keys: BILLING_LINK_KEYS, comma-separated base64 16-byte AES keys. The first
// encrypts; decryption tries each in turn, so a rotated-out key keeps its links
// working while it stays in the list.
const BILLING_LINK_BASE = "https://www.firecrawl.dev/billing";
const BILLING_SETTINGS_URL =
  "https://www.firecrawl.dev/app/settings?tab=billing";

export type BillingLinkReason = "out_of_credits" | "low_credits";

// Index = code in the token. Append only.
const SURFACE_CODES: readonly KeylessSignupSurface[] = ["api", "mcp", "cli"];
const REASON_CODES: readonly BillingLinkReason[] = [
  "out_of_credits",
  "low_credits",
];

const TOKEN_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const TOKEN_LENGTH = 32;
const TOKEN_PATTERN = /^[0-9abcdefghjkmnpqrstvwxyz]{32}$/;
const TOKEN_TWEAK = Buffer.from("fc-billing-v1", "ascii");
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHECK_BITS = 27n;
const CHECK_MASK = (1n << CHECK_BITS) - 1n;

type BillingLinkPayload = {
  orgId: string;
  surface: KeylessSignupSurface | null;
  reason: BillingLinkReason | null;
};

/** The billing settings link with attribution, used when no token can be given. */
export function billingFallbackUrl(
  surface: KeylessSignupSurface,
  reason: BillingLinkReason,
): string {
  return `${BILLING_SETTINGS_URL}&utm_source=agent_hints&utm_medium=${surface}&utm_campaign=${reason}`;
}

// Canonical base64 of exactly 16 bytes.
const KEY_PATTERN = /^[A-Za-z0-9+/]{21}[AQgw]==$/;
let cachedKeys: { raw: string | undefined; keys: Buffer[] } | undefined;

/** Parsed BILLING_LINK_KEYS; malformed entries are skipped. */
function billingLinkKeys(): Buffer[] {
  const raw = config.BILLING_LINK_KEYS;
  if (cachedKeys && cachedKeys.raw === raw) return cachedKeys.keys;
  const keys = (raw ?? "")
    .split(",")
    .map(entry => entry.trim())
    .filter(entry => KEY_PATTERN.test(entry))
    .map(entry => Buffer.from(entry, "base64"));
  cachedKeys = { raw, keys };
  return keys;
}

function toNumerals(x: bigint): number[] {
  const out = new Array<number>(TOKEN_LENGTH);
  for (let i = TOKEN_LENGTH - 1; i >= 0; i--) {
    out[i] = Number(x & 31n);
    x >>= 5n;
  }
  return out;
}

function fromNumerals(numerals: number[]): bigint {
  return numerals.reduce((x, digit) => (x << 5n) | BigInt(digit), 0n);
}

/** The 32-character token, or undefined when the org id is not a uuid. */
export function encryptBillingLinkToken(
  payload: {
    orgId: string;
    surface: KeylessSignupSurface;
    reason: BillingLinkReason;
  },
  key: Buffer,
): string | undefined {
  if (!UUID_PATTERN.test(payload.orgId)) return undefined;
  const plaintext =
    (BigInt(`0x${payload.orgId.replace(/-/g, "")}`) << 32n) |
    (BigInt(SURFACE_CODES.indexOf(payload.surface)) << 30n) |
    (BigInt(REASON_CODES.indexOf(payload.reason)) << CHECK_BITS);
  return ff1Encrypt(key, TOKEN_TWEAK, 32, toNumerals(plaintext))
    .map(d => TOKEN_ALPHABET[d])
    .join("");
}

/**
 * The link a token carries, or null when it is malformed or no key yields
 * zero check bits. Tries every configured key unless keys are given.
 */
export function decryptBillingLinkToken(
  token: string,
  keys: Buffer[] = billingLinkKeys(),
): BillingLinkPayload | null {
  if (!TOKEN_PATTERN.test(token)) return null;
  const numerals = [...token].map(c => TOKEN_ALPHABET.indexOf(c));
  for (const key of keys) {
    const plaintext = fromNumerals(ff1Decrypt(key, TOKEN_TWEAK, 32, numerals));
    if ((plaintext & CHECK_MASK) !== 0n) continue;
    const hex = (plaintext >> 32n).toString(16).padStart(32, "0");
    return {
      orgId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
      surface: SURFACE_CODES[Number((plaintext >> 30n) & 3n)] ?? null,
      reason: REASON_CODES[Number((plaintext >> CHECK_BITS) & 7n)] ?? null,
    };
  }
  return null;
}

/**
 * The org's own billing link: www.firecrawl.dev/billing/<token> when a key is
 * configured, else the billing settings link with attribution. Pure CPU, no
 * I/O, never throws.
 */
export function billingLink(
  orgId: string,
  surface: KeylessSignupSurface,
  reason: BillingLinkReason,
): string {
  try {
    const key = billingLinkKeys()[0];
    const token = key
      ? encryptBillingLinkToken({ orgId, surface, reason }, key)
      : undefined;
    if (token) return `${BILLING_LINK_BASE}/${token}`;
  } catch (error) {
    logger.warn("Billing link encryption failed", {
      module: "billing-link",
      surface,
      error,
    });
  }
  return billingFallbackUrl(surface, reason);
}
