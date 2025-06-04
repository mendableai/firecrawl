import axios, { AxiosError } from "axios";
import { logger as _logger } from "../lib/logger";
import { supabase_rr_service, supabase_service } from "./supabase";
import { WebhookEventType } from "../types";
import { configDotenv } from "dotenv";
import { z } from "zod";
import { webhookSchema } from "../controllers/v1/types";
configDotenv();

async function logWebhook(data: {
  success: boolean;
  error?: string;
  teamId: string;
  crawlId: string;
  scrapeId?: string;
  url: string;
  statusCode?: number;
  event: WebhookEventType
}) {
  try {
    await supabase_service
      .from("webhook_logs")
      .insert({
        success: data.success,
        error: data.error ?? null,
        team_id: data.teamId,
        crawl_id: data.crawlId,
        scrape_id: data.scrapeId ?? null,
        url: data.url,
        status_code: data.statusCode ?? null,
        event: data.event,
      })
      .throwOnError();
  } catch (error) {
    _logger.error("Error logging webhook", { error, crawlId: data.crawlId, scrapeId: data.scrapeId, teamId: data.teamId, team_id: data.teamId, module: "webhook", method: "logWebhook" });
  }
}

export const callWebhook = async ({
  teamId,
  crawlId,
  scrapeId,
  data,
  webhook,
  v1,
  eventType,
  awaitWebhook = false,
}: {
  teamId: string;
  crawlId: string;
  scrapeId?: string;
  webhook?: z.infer<typeof webhookSchema>,
  v1: boolean,
  data: any | null;
  eventType: WebhookEventType,
  awaitWebhook?: boolean;
}) => {
  const logger = _logger.child({
    module: "webhook",
    method: "callWebhook",
    teamId, team_id: teamId,
    crawlId,
    scrapeId,
    eventType,
    awaitWebhook,
    webhook,
    isV1: v1,
  });

  if (webhook) {
    let subType = eventType.split(".")[1];
    if (!webhook.events.includes(subType as any)) {
      logger.debug("Webhook event type not in specified events", {
        subType,
        webhook,
      });
      return false;
    }
  }

  try {
    const selfHostedUrl = process.env.SELF_HOSTED_WEBHOOK_URL?.replace(
      "{{JOB_ID}}",
      crawlId,
    );
    const useDbAuthentication = process.env.USE_DB_AUTHENTICATION === "true";
    let webhookUrl =
      webhook ??
      (selfHostedUrl ? webhookSchema.parse({ url: selfHostedUrl }) : undefined);

    // Only fetch the webhook URL from the database if the self-hosted webhook URL and specified webhook are not set
    // and the USE_DB_AUTHENTICATION environment variable is set to true
    if (!webhookUrl && useDbAuthentication) {
      const { data: webhooksData, error } = await supabase_rr_service
        .from("webhooks")
        .select("url")
        .eq("team_id", teamId)
        .limit(1);
      if (error) {
        logger.error(
          `Error fetching webhook URL for team`,
          {
            error,
          },
        );
        return null;
      }

      if (!webhooksData || webhooksData.length === 0) {
        return null;
      }

      webhookUrl = webhooksData[0].url;
    }

    logger.debug("Calling webhook...", {
      webhookUrl,
    });

    if (!webhookUrl) {
      return null;
    }

    let dataToSend: any[] = [];
    if (
      data &&
      data.result &&
      data.result.links &&
      data.result.links.length !== 0
    ) {
      for (let i = 0; i < data.result.links.length; i++) {
        if (v1) {
          dataToSend.push(data.result.links[i].content);
        } else {
          dataToSend.push({
            content: data.result.links[i].content.content,
            markdown: data.result.links[i].content.markdown,
            metadata: data.result.links[i].content.metadata,
          });
        }
      }
    }

    if (awaitWebhook) {
      try {
        const res = await axios.post(
          webhookUrl.url,
          {
            success: !v1
              ? data.success
              : eventType === "crawl.page"
                ? data.success
                : true,
            type: eventType,
            [v1 ? "id" : "jobId"]: crawlId,
            data: dataToSend,
            error: !v1
              ? data?.error || undefined
              : eventType === "crawl.page"
                ? data?.error || undefined
                : undefined,
            metadata: webhookUrl.metadata || undefined,
          },
          {
            headers: {
              "Content-Type": "application/json",
              ...webhookUrl.headers,
            },
            timeout: v1 ? 10000 : 30000, // 10 seconds timeout (v1)
          },
        );
        logWebhook({
          success: res.status >= 200 && res.status < 300,
          teamId,
          crawlId,
          scrapeId,
          url: webhookUrl.url,
          event: eventType,
          statusCode: res.status,
        });
      } catch (error) {
        logger.error(
          `Failed to send webhook`,
          {
            error,
          },
        );
        logWebhook({
          success: false,
          teamId,
          crawlId,
          scrapeId,
          url: webhookUrl.url,
          event: eventType,
          error: error instanceof Error ? error.message : (typeof error === "string" ? error : undefined),
          statusCode: error instanceof AxiosError ? error.response?.status : undefined,
        });
      }
    } else {
      axios
        .post(
          webhookUrl.url,
          {
            success: !v1
              ? data.success
              : eventType === "crawl.page"
                ? data.success
                : true,
            type: eventType,
            [v1 ? "id" : "jobId"]: crawlId,
            data: dataToSend,
            error: !v1
              ? data?.error || undefined
              : eventType === "crawl.page"
                ? data?.error || undefined
                : undefined,
            metadata: webhookUrl.metadata || undefined,
          },
          {
            headers: {
              "Content-Type": "application/json",
              ...webhookUrl.headers,
            },
          },
        )
        .then((res) => {
          logWebhook({
            success: res.status >= 200 && res.status < 300,
            teamId,
            crawlId,
            scrapeId,
            url: webhookUrl.url,
            event: eventType,
            statusCode: res.status,
          });
        })
        .catch((error) => {
          logger.error(
            `Failed to send webhook`,
            {
              error,
            },
          );
          logWebhook({
            success: false,
            teamId,
            crawlId,
            scrapeId,
            url: webhookUrl.url,
            event: eventType,
            error: error instanceof Error ? error.message : (typeof error === "string" ? error : undefined),
            statusCode: error instanceof AxiosError ? error.response?.status : undefined,
          });
        });
    }
  } catch (error) {
    logger.debug(
      `Error sending webhook`,
      {
        error,
      },
    );
  }
};
