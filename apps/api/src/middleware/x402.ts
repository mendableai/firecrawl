import { paymentMiddleware, Network, Resource } from 'x402-express';
import { Request, Response, NextFunction } from 'express';

export const x402SearchMiddleware = paymentMiddleware(
  (process.env.X402_PAY_TO_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`,
  {
    "POST /v1/search": {
      price: "$0.002",
      network: (process.env.X402_NETWORK as Network) || "base-sepolia",
      config: {
        description: "Firecrawl Search Request",
        mimeType: "application/json",
        maxTimeoutSeconds: 60,
      }
    }
  },
  {
    url:  (process.env.FACILITATOR_URL as Resource) || "https://x402.org/facilitator",
  }
);
