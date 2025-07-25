import { Request, Response } from "express";
import crypto from 'crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { getAddress } from 'viem';
import {
  GeneratePaymentHeaderResponse,
  GeneratePaymentHeaderRequest,
  RequestWithAuth,
} from "./types";

interface PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: {
    name: string;
    version: string;
  };
}

// Generate a random nonce (32 bytes = 64 hex chars)
function generateNonce(): string {
  return '0x' + crypto.randomBytes(32).toString('hex');
}

// Create the unsigned payment header
function createUnsignedPaymentHeader(account: any, paymentRequirements: PaymentRequirements, durationSeconds: number): any {
  const now = Math.floor(Date.now() / 1000);
  const validAfter = (now - 60).toString(); // 60 seconds before
  const validBefore = (now + durationSeconds).toString();
  const nonce = generateNonce();

  return {
    x402Version: 1,
    scheme: paymentRequirements.scheme,
    network: paymentRequirements.network,
    payload: {
      signature: null,
      authorization: {
        from: account.address,
        to: getAddress(paymentRequirements.payTo),
        value: paymentRequirements.maxAmountRequired,
        validAfter: validAfter,
        validBefore: validBefore,
        nonce: nonce
      }
    }
  };
}

// Create EIP-712 typed data for signing
function createTypedData(paymentRequirements: PaymentRequirements, authorization: any): any {
  return {
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" }
      ]
    },
    primaryType: "TransferWithAuthorization",
    domain: {
      name: paymentRequirements.extra.name,
      version: paymentRequirements.extra.version,
      chainId: 84532, // Base Sepolia chain ID
      verifyingContract: getAddress(paymentRequirements.asset)
    },
    message: {
      from: authorization.from,
      to: authorization.to,
      value: authorization.value,
      validAfter: authorization.validAfter,
      validBefore: authorization.validBefore,
      nonce: authorization.nonce
    }
  };
}

// Base64 encode the payment header
function encodePayment(paymentHeader: any): string {
  const jsonString = JSON.stringify(paymentHeader);
  return Buffer.from(jsonString).toString('base64');
}

export async function generatePaymentHeaderController(req: RequestWithAuth<{}, GeneratePaymentHeaderResponse, GeneratePaymentHeaderRequest>,
  res: Response<GeneratePaymentHeaderResponse>) {
  try {
    const { privateKey, duration, resource }: GeneratePaymentHeaderRequest = req.body;

    if (!privateKey) {
      return res.status(400).json({
        success: false,
        error: "Private key is required"
      });
    }

    if (!duration || !['1h', '1d', '1w'].includes(duration)) {
      return res.status(400).json({
        success: false,
        error: "Duration must be one of: 1h, 1d, 1w"
      });
    }

    // Convert duration to seconds
    const durationMap = {
      '1h': 3600,
      '1d': 86400,
      '1w': 604800
    };
    const durationSeconds = durationMap[duration];

    // Payment requirements based on the Express server configuration
    const getPaymentRequirements = (resource: string): PaymentRequirements => {
      const baseRequirements = {
        scheme: "exact",
        network: "base-sepolia",
        mimeType: "application/json",
        payTo: process.env.X402_PAY_TO_ADDRESS || "0x0000000000000000000000000000000000000000",
        maxTimeoutSeconds: durationSeconds,
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on Base Sepolia
        extra: {
          name: "USDC",
          version: "2"
        }
      };

      // Get the base URL from the request
      const protocol = req.protocol || 'http';
      const host = req.get('host') || 'localhost:3002';
      const baseUrl = `${protocol}://${host}`;

      switch (resource) {
        case 'x402/search':
        default:
          return {
            ...baseRequirements,
            maxAmountRequired: "10000", // $0.01 in USDC base units - matches X402_ENDPOINT_PRICE_USD ("20000" => $0.02)
            resource: `${baseUrl}/v1/x402/search`,
            description: "x402 search payment API",
          };
      }
    };

    const PAYMENT_REQUIREMENTS = getPaymentRequirements(resource);

    // Create account from private key
    const account = privateKeyToAccount(privateKey as `0x${string}`);

    // Create unsigned payment header
    const unsignedHeader = createUnsignedPaymentHeader(account, PAYMENT_REQUIREMENTS, durationSeconds);

    // Create typed data for signing
    const typedData = createTypedData(PAYMENT_REQUIREMENTS, unsignedHeader.payload.authorization);

    // Sign the typed data
    const signature = await account.signTypedData(typedData);

    // Add signature to the header
    const signedHeader = {
      ...unsignedHeader,
      payload: {
        ...unsignedHeader.payload,
        signature: signature
      }
    };

    // Encode the final payment header
    const encodedHeader = encodePayment(signedHeader);

    // Return the payment header and additional info
    res.json({
      success: true,
      data: {
        paymentHeader: encodedHeader,
        walletAddress: account.address,
        duration: duration,
        validUntil: new Date((Math.floor(Date.now() / 1000) + durationSeconds) * 1000).toISOString(),
        notes: {
          timeSensitive: `This payment header is time-sensitive (valid for ${duration})`,
          walletRequirement: "Make sure your wallet has USDC on Base Sepolia",
          paymentAmount: "10000 USDC (in base units = $0.01)", // 20000 USDC (in base units = $0.02)
          generatedAt: new Date().toISOString(),
          team_id: req.auth?.team_id || req.acuc?.team_id
        }
      }
    });

  } catch (error) {
    console.error('Error generating payment header:', error);
    res.status(500).json({
      success: false,
      error: "Failed to generate payment header",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
} 