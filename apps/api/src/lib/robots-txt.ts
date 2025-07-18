import robotsParser, { Robot } from "robots-parser";
import axios from "axios";
import { axiosTimeout } from "./timeout";
import https from "https";
import { Logger } from "winston";

export interface RobotsTxtChecker {
  robotsTxtUrl: string;
  robotsTxt: string;
  robots: Robot;
}

export async function fetchRobotsTxt(
  url: string,
  skipTlsVerification: boolean = false,
  abort?: AbortSignal
): Promise<string> {
  const urlObj = new URL(url);
  const robotsTxtUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;
  
  let extraArgs: any = {};
  if (skipTlsVerification) {
    extraArgs.httpsAgent = new https.Agent({
      rejectUnauthorized: false,
    });
  }
  
  const response = await axios.get(robotsTxtUrl, {
    timeout: axiosTimeout,
    signal: abort,
    ...extraArgs,
  });
  
  return response.data;
}

export function createRobotsChecker(url: string, robotsTxt: string): RobotsTxtChecker {
  const urlObj = new URL(url);
  const robotsTxtUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;
  const robots = robotsParser(robotsTxtUrl, robotsTxt);
  
  return {
    robotsTxtUrl,
    robotsTxt,
    robots,
  };
}

export function isUrlAllowedByRobots(
  url: string,
  robots: Robot | null,
  userAgents: string[] = ["FireCrawlAgent", "FirecrawlAgent"]
): boolean {
  if (!robots) return true;
  
  for (const userAgent of userAgents) {
    if (robots.isAllowed(url, userAgent)) {
      return true;
    }
  }
  
  return false;
}

export async function checkRobotsTxt(
  url: string,
  skipTlsVerification: boolean = false,
  logger?: Logger,
  abort?: AbortSignal
): Promise<boolean> {
  try {
    const robotsTxt = await fetchRobotsTxt(url, skipTlsVerification, abort);
    const checker = createRobotsChecker(url, robotsTxt);
    return isUrlAllowedByRobots(url, checker.robots);
  } catch (error) {
    // If we can't fetch robots.txt, assume it's allowed
    logger?.debug("Failed to fetch robots.txt, allowing scrape", { error, url });
    return true;
  }
}