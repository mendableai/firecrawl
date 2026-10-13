import type { Request, RequestHandler, Response } from "express";
import { config } from "../config";
import type { RequestWithMaybeAuth } from "../controllers/v1/types";
import { evaluateAgentHintRules } from "../lib/agent-hint-rules";
import {
  computeAgentHintSignals,
  type AgentHintEndpoint,
} from "../lib/agent-hint-signals";
import {
  agentHintsProviderRequestsTotal,
  getProviderHints,
  mergeAgentHints,
  providerTeamId,
  type ProviderHintsHolder,
} from "../lib/agent-hints-provider";
import { keylessSignupSurface } from "../lib/keyless-signup-link";
import { logger } from "../lib/logger";

export function agentHintsRequested(req: Request): boolean {
  return req.get("X-Firecrawl-Agent-Hints")?.trim().toLowerCase() === "true";
}

function agentHintsFor(
  req: Request,
  res: Response,
  endpoint: AgentHintEndpoint,
  body: Record<string, unknown>,
): string[] {
  const teamId = (req as RequestWithMaybeAuth).auth?.team_id;
  const provider: ProviderHintsHolder | undefined =
    res.locals.agentHintsProvider;
  const context = {
    endpoint,
    response: body,
    remainingCredits: res.locals.agentCreditsRemaining,
    canUseMapAndCrawl: !!teamId && !teamId.startsWith("preview_keyless_"),
    canUseInteract: config.USE_DB_AUTHENTICATION === true,
    domainProviders: res.locals.agentHintDomainProviders,
  };
  const rules = provider?.settled ? provider.rules : [];
  const { hints, providerHintIds } = mergeAgentHints(
    rules.length > 0
      ? evaluateAgentHintRules(rules, computeAgentHintSignals(context))
      : [],
    provider?.settled && body.success === true ? provider.hints : [],
  );
  if (providerHintIds.length > 0) {
    logger.info("Served external agent hints", {
      module: "agent-hints-provider",
      endpoint,
      team_id: teamId ? providerTeamId(teamId) : undefined,
      hint_ids: providerHintIds,
    });
  }
  return hints;
}

/**
 * How long an insufficient-credits refusal may wait for the in-flight provider
 * lookup: whatever is left of the provider timeout since the lookup started.
 * The refusal is sent a few milliseconds after auth, so without this wait it
 * would never carry rule hints on a cold cache. Every other response is sent
 * as soon as the handler calls res.json.
 */
function providerWaitMs(res: Response): number {
  const provider: ProviderHintsHolder | undefined =
    res.locals.agentHintsProvider;
  if (res.locals.insufficientCredits !== true || !provider || provider.settled)
    return 0;
  return Math.min(
    config.AGENT_HINTS_PROVIDER_TIMEOUT_MS,
    provider.startedAt + config.AGENT_HINTS_PROVIDER_TIMEOUT_MS - Date.now(),
  );
}

/**
 * Only registered on business POST routes, never feedback or polling routes.
 * Hint computation must never change the response otherwise: any error sends
 * the original body unchanged.
 */
export function agentHintsMiddleware(
  endpoint: AgentHintEndpoint,
): RequestHandler {
  return (req, res, next) => {
    if (!agentHintsRequested(req)) return next();
    const json = res.json;
    const send = (body: Record<string, unknown>) => {
      let output = body;
      try {
        const hints = agentHintsFor(req, res, endpoint, body);
        if (hints.length > 0) output = { ...body, agent_hints: hints };
      } catch (error) {
        agentHintsProviderRequestsTotal.inc({ outcome: "eval_error" });
        logger.warn("Agent hints computation failed", {
          module: "agent-hints",
          endpoint,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return json.call(res, output);
    };
    res.json = function (body) {
      if (!body || typeof body !== "object" || Array.isArray(body))
        return json.call(this, body);
      const waitMs = providerWaitMs(res);
      if (waitMs <= 0) return send(body);
      // Deferred send: the only caller of this path returns right after
      // res.json and never touches the response again, so returning before
      // the body is written is safe. The wait is bounded and never rejects.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<void>(resolve => {
        timer = setTimeout(resolve, waitMs);
      });
      void Promise.race([res.locals.agentHintsProvider.ready, deadline])
        .then(() => {
          clearTimeout(timer);
          if (!res.writableEnded) send(body);
        })
        .catch(error => {
          logger.warn("Deferred response could not be sent", {
            module: "agent-hints",
            endpoint,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      return this;
    };
    next();
  };
}

/**
 * Starts the optional external hints lookup. Must run after authMiddleware so
 * the team is known; it never waits for the provider.
 */
export function agentHintsProviderMiddleware(
  endpoint: AgentHintEndpoint,
): RequestHandler {
  return (req, res, next) => {
    if (!agentHintsRequested(req)) return next();
    const authReq = req as RequestWithMaybeAuth;
    const teamId = authReq.auth?.team_id;
    if (!teamId) return next();
    const apiKeyId = authReq.acuc?.api_key_id;
    try {
      res.locals.agentHintsProvider = getProviderHints({
        teamId,
        orgId: authReq.auth?.org_id ?? null,
        apiKeyId:
          typeof apiKeyId === "number" && Number.isFinite(apiKeyId)
            ? apiKeyId
            : null,
        endpoint,
        surface: keylessSignupSurface(req),
        keyless: teamId.startsWith("preview_keyless_"),
      });
    } catch (error) {
      logger.warn("Agent hints provider lookup could not start", {
        module: "agent-hints-provider",
        endpoint,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    next();
  };
}
