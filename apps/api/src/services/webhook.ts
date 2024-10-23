import axios from "axios";
import { legacyDocumentConverter } from "../../src/controllers/v1/types";
import { Logger } from "../../src/lib/logger";
import { WebhookEventType } from "../types";
import { configDotenv } from "dotenv";
configDotenv();

export const callWebhook = async (
  teamId: string,
  id: string,
  data: any | null,
  specified?: string,
  v1 = false,
  eventType: WebhookEventType = "crawl.page",
  awaitWebhook: boolean = false
) => {
  try {
    const selfHostedUrl = process.env.SELF_HOSTED_WEBHOOK_URL?.replace(
      "{{JOB_ID}}",
      id
    );
    let webhookUrl = specified ?? selfHostedUrl;

    let dataToSend = [];
    if (
      data &&
      data.result &&
      data.result.links &&
      data.result.links.length !== 0
    ) {
      for (let i = 0; i < data.result.links.length; i++) {
        if (v1) {
          dataToSend.push(
            legacyDocumentConverter(data.result.links[i].content)
          );
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
        await axios.post(
          webhookUrl,
          {
            success: !v1
              ? data.success
              : eventType === "crawl.page"
              ? data.success
              : true,
            type: eventType,
            [v1 ? "id" : "jobId"]: id,
            data: dataToSend,
            error: !v1
              ? data?.error || undefined
              : eventType === "crawl.page"
              ? data?.error || undefined
              : undefined,
          },
          {
            headers: {
              "Content-Type": "application/json",
            },
            timeout: v1 ? 10000 : 30000, // 10 seconds timeout (v1)
          }
        );
      } catch (error) {
        Logger.error(
          `Axios error (0) sending webhook for team ID: ${teamId}, error: ${error.message}`
        );
      }
    } else {
      axios
        .post(
          webhookUrl,
          {
            success: !v1
              ? data.success
              : eventType === "crawl.page"
              ? data.success
              : true,
            type: eventType,
            [v1 ? "id" : "jobId"]: id,
            data: dataToSend,
            error: !v1
              ? data?.error || undefined
              : eventType === "crawl.page"
              ? data?.error || undefined
              : undefined,
          },
          {
            headers: {
              "Content-Type": "application/json",
            },
            timeout: v1 ? 10000 : 30000, // 10 seconds timeout (v1)
          }
        )
        .catch((error) => {
          Logger.error(
            `Axios error sending webhook for team ID: ${teamId}, error: ${error.message}`
          );
        });
    }
  } catch (error) {
    Logger.debug(
      `Error sending webhook for team ID: ${teamId}, error: ${error.message}`
    );
  }
};
