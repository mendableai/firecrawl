import { Request } from "express";

/**
 * Determines the correct protocol for response URLs based on the request
 * For localhost requests, preserve the original protocol (HTTP/HTTPS)
 * For production requests, always use HTTPS
 */
export function getResponseProtocol(req: Request): string {
  const host = req.get("host") || "";
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1") || host.includes("0.0.0.0");
  
  if (isLocalhost) {
    return req.protocol;
  }
  
  return "https";
}
