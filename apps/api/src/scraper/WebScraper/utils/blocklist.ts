import { logger } from "../../../lib/logger";
import crypto from "crypto";
import { configDotenv } from "dotenv";
configDotenv();

const hashKey = Buffer.from(process.env.HASH_KEY || "", "utf-8");
const algorithm = "aes-256-ecb";

function encryptAES(plaintext: string, key: Buffer): string {
  const cipher = crypto.createCipheriv(algorithm, key, null);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);
  return encrypted.toString("base64");
}

function decryptAES(ciphertext: string, key: Buffer): string {
  const decipher = crypto.createDecipheriv(algorithm, key, null);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf-8");
}

const urlBlocklist = [
  "h8ngAFXUNLO3ZqQufJjGVA==",
  "fEGiDm/TWDBkXUXejFVICg==",
  "l6Mei7IGbEmTTFoSudUnqQ==",
  "4OjallJzXRiZUAWDiC2Xww==",
  "ReSvkSfx34TNEdecmmSDdQ==",
  "X1E4WtdmXAv3SAX9xN925Q==",
  "VTzBQfMtXZzM05mnNkWkjA==",
  "m/q4Lb2Z8cxwU7/CoztOFg==",
  "UbVnmRaeG+gKcyVDLAm0vg==",
  "xNQhczYG22tTVc6lYE3qwg==",
  "CQfGDydbg4l1swRCru6O6Q==",
  "l86LQxm2NonTWMauXwEsPw==",
  "6v4QDUcwjnID80G+uU+tgw==",
  "pCF/6nrKZAxaYntzEGluZQ==",
  "r0CRhAmQqSe7V2s3073T00sAh4WcS5779jwuGJ26ows==",
  "aBOVqRFBM4UVg33usY10NdiF0HCnFH/ImtD0n+zIpc8==",
  "QV436UZuQ6D0Dqrx9MwaGw==",
  "OYVvrwILYbzA2mSSqOPPpw==",
  "xW2i4C0Dzcnp+qu12u0SAw==",
  "OLHba209l0dfl0MI4EnQonBITK9z8Qwgd/NsuaTkXmA=",
  "X0VynmNjpL3PrYxpUIG7sFMBt8OlrmQWtxj8oXVu2QM=",
  "ObdlM5NEkvBJ/sojRW5K/Q==",
  "C8Th38X0SjsE1vL/OsD8bA==",
  "PTbGg8PK/h0Seyw4HEpK4Q==",
  "lZdQMknjHb7+4+sjF3qNTw==",
  "LsgSq54q5oDysbva29JxnQ==",
  "KZfBtpwjOpdSoqacRbz7og==",
  "Indtl4yxJMHCKBGF4KABCQ==",
  "e3HFXLVgxhaVoadYpwb2BA==",
  "b+asgLayXQ5Jq+se+q56jA==",
  "86ZDUI7vmp4MvNq3fvZrGQ==",
  "sEGFoYZ6GEg4Zocd+TiyfQ==",
  "6OOL72eXthgnJ1Hj4PfOQQ==",
  "g/ME+Sh1CAFboKrwkVb+5Q==",
  "Pw+xawUoX8xBYbX2yqqGWQ==",
  "k6vBalxYFhAvkPsF19t9gQ==",
  "e3HFXLVgxhaVoadYpwb2BA==",
  "b+asgLayXQ5Jq+se+q56jA==",
  "KKttwRz4w+AMJrZcB828WQ==",
  "vMdzZ33BXoyWVZnAPOBcrg==",
  "l8GDVI8w/ueHnNzdN1ODuQ==",
];

const decryptedBlocklist =
  hashKey.length > 0
    ? urlBlocklist.map((ciphertext) => decryptAES(ciphertext, hashKey))
    : [];

const allowedKeywords = [
  "pulse",
  "privacy",
  "terms",
  "policy",
  "user-agreement",
  "legal",
  "help",
  "policies",
  "support",
  "contact",
  "about",
  "careers",
  "blog",
  "press",
  "conditions",
  "tos",
  "://library.tiktok.com",
  "://ads.tiktok.com",
  "://tiktok.com/business",
  "://developers.facebook.com",
];

export function isUrlBlocked(url: string): boolean {
  const lowerCaseUrl = url.toLowerCase();

  // Check if the URL contains any allowed keywords as whole words
  if (
    allowedKeywords.some((keyword) =>
      new RegExp(`\\b${keyword}\\b`, "i").test(lowerCaseUrl),
    )
  ) {
    return false;
  }

  try {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    // Check if the URL matches any domain in the blocklist
    const isBlocked = decryptedBlocklist.some((domain) => {
      const domainPattern = new RegExp(
        `(^|\\.)${domain.replace(".", "\\.")}(\\.|$)`,
        "i",
      );
      return domainPattern.test(hostname);
    });

    return isBlocked;
  } catch (e) {
    // If an error occurs (e.g., invalid URL), return false
    logger.error(`Error parsing the following URL: ${url}`);
    return false;
  }
}
